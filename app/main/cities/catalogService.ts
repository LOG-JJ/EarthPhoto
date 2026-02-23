import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';

import Database from 'better-sqlite3';

import type { CityCatalogStatus, CityItem, ContinentItem, CountryItem } from '@shared/types/ipc';

import { CITY_CATALOG_FILENAME } from './catalogDb';
import { importGeoNamesCatalog, normalizeCityName } from './catalogImporter';

interface CatalogMetaRows {
  updatedAtMs: number | null;
  rowCount: number;
}

export class CityCatalogService {
  private readonly listeners = new Set<(progress: CityCatalogStatus) => void>();
  private readonly countryCacheByContinent = new Map<string, CountryItem[]>();
  private status: CityCatalogStatus = {
    phase: 'idle',
    percent: 0,
    message: 'City catalog is not initialized.',
    updatedAtMs: null,
    rowCount: 0,
  };
  private inFlight: Promise<CityCatalogStatus> | null = null;
  private db: Database.Database | null = null;

  constructor(
    private readonly catalogDir: string,
    private readonly logDir: string,
  ) {}

  getStatus(): CityCatalogStatus {
    if (this.status.phase === 'idle') {
      this.status = this.readExistingStatus();
    }
    return this.status;
  }

  onProgress(listener: (progress: CityCatalogStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.getStatus());
    return () => {
      this.listeners.delete(listener);
    };
  }

  async ensureCatalog(): Promise<CityCatalogStatus> {
    const current = this.readExistingStatus();
    if (current.phase === 'ready') {
      this.updateStatus(current);
      return current;
    }

    if (this.inFlight) {
      return this.inFlight;
    }

    this.inFlight = this.rebuildCatalog();
    return this.inFlight;
  }

  getContinents(): ContinentItem[] {
    const db = this.getDbOrNull();
    if (!db) {
      return [];
    }

    const rows = db
      .prepare(
        `
        SELECT
          city.continentCode AS code,
          MIN(country.continentName) AS name,
          COUNT(DISTINCT city.countryCode) AS countryCount,
          COUNT(1) AS cityCount
        FROM city_catalog AS city
        INNER JOIN country_catalog AS country ON country.countryCode = city.countryCode
        GROUP BY city.continentCode
        ORDER BY name ASC
      `,
      )
      .all() as Array<{
      code: string;
      name: string;
      countryCount: number;
      cityCount: number;
    }>;

    return rows.map((row) => ({
      code: row.code,
      name: row.name,
      countryCount: Number(row.countryCount) || 0,
      cityCount: Number(row.cityCount) || 0,
    }));
  }

  getCountries(continentCode: string): CountryItem[] {
    const safeContinentCode = continentCode.trim().toUpperCase();
    if (!safeContinentCode) {
      return [];
    }

    const cached = this.countryCacheByContinent.get(safeContinentCode);
    if (cached) {
      return cached;
    }

    const db = this.getDbOrNull();
    if (!db) {
      return [];
    }

    const rows = db
      .prepare(
        `
        SELECT
          countryCode AS code,
          countryName AS name,
          continentCode,
          (
            SELECT COUNT(1)
            FROM city_catalog
            WHERE city_catalog.countryCode = country_catalog.countryCode
          ) AS cityCount
        FROM country_catalog
        WHERE continentCode = ?
        ORDER BY countryName ASC
      `,
      )
      .all(safeContinentCode) as Array<{
      code: string;
      name: string;
      continentCode: string;
      cityCount: number;
    }>;

    const countries = rows.map((row) => ({
      code: row.code,
      name: row.name,
      continentCode: row.continentCode,
      cityCount: Number(row.cityCount) || 0,
    }));
    this.countryCacheByContinent.set(safeContinentCode, countries);
    return countries;
  }

  getCities(payload: {
    continentCode: string;
    countryCode: string;
    query?: string;
    limit: number;
    offset: number;
  }): CityItem[] {
    const continentCode = payload.continentCode.trim().toUpperCase();
    const countryCode = payload.countryCode.trim().toUpperCase();
    if (!continentCode || !countryCode) {
      return [];
    }

    const limit = Math.max(1, Math.min(500, Math.trunc(payload.limit)));
    const offset = Math.max(0, Math.trunc(payload.offset));
    const query = (payload.query ?? '').trim();
    const normalizedQuery = query.length > 0 ? normalizeCityName(query, null) : '';

    const db = this.getDbOrNull();
    if (!db) {
      return [];
    }

    const args: Array<string | number> = [continentCode, countryCode];
    const whereQuery =
      normalizedQuery.length > 0
        ? 'AND city.normalizedName LIKE ?'
        : '';
    if (normalizedQuery.length > 0) {
      args.push(`${normalizedQuery}%`);
    }
    args.push(limit, offset);

    const rows = db
      .prepare(
        `
        SELECT
          city.cityId AS id,
          city.geonameId AS geonameId,
          city.name AS name,
          city.asciiName AS asciiName,
          city.countryCode AS countryCode,
          country.countryName AS countryName,
          city.continentCode AS continentCode,
          country.continentName AS continentName,
          city.lat AS lat,
          city.lng AS lng,
          city.population AS population
        FROM city_catalog AS city
        INNER JOIN country_catalog AS country ON country.countryCode = city.countryCode
        WHERE city.continentCode = ?
          AND city.countryCode = ?
          ${whereQuery}
        ORDER BY city.population DESC, city.name ASC
        LIMIT ? OFFSET ?
      `,
      )
      .all(...args) as Array<{
      id: string;
      geonameId: number;
      name: string;
      asciiName: string | null;
      countryCode: string;
      countryName: string;
      continentCode: string;
      continentName: string;
      lat: number;
      lng: number;
      population: number;
    }>;

    return rows.map((row) => ({
      id: row.id,
      geonameId: Number(row.geonameId),
      name: row.name,
      asciiName: row.asciiName,
      countryCode: row.countryCode,
      countryName: row.countryName,
      continentCode: row.continentCode,
      continentName: row.continentName,
      lat: row.lat,
      lng: row.lng,
      population: Number(row.population) || 0,
    }));
  }

  getByIds(ids: string[]): CityItem[] {
    const cleanIds = Array.from(new Set(ids.map((item) => item.trim()).filter((item) => item.length > 0)));
    if (cleanIds.length === 0) {
      return [];
    }

    const db = this.getDbOrNull();
    if (!db) {
      return [];
    }

    const placeholders = cleanIds.map(() => '?').join(', ');
    const rows = db
      .prepare(
        `
        SELECT
          city.cityId AS id,
          city.geonameId AS geonameId,
          city.name AS name,
          city.asciiName AS asciiName,
          city.countryCode AS countryCode,
          country.countryName AS countryName,
          city.continentCode AS continentCode,
          country.continentName AS continentName,
          city.lat AS lat,
          city.lng AS lng,
          city.population AS population
        FROM city_catalog AS city
        INNER JOIN country_catalog AS country ON country.countryCode = city.countryCode
        WHERE city.cityId IN (${placeholders})
      `,
      )
      .all(...cleanIds) as Array<{
      id: string;
      geonameId: number;
      name: string;
      asciiName: string | null;
      countryCode: string;
      countryName: string;
      continentCode: string;
      continentName: string;
      lat: number;
      lng: number;
      population: number;
    }>;

    const byId = new Map(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          geonameId: Number(row.geonameId),
          name: row.name,
          asciiName: row.asciiName,
          countryCode: row.countryCode,
          countryName: row.countryName,
          continentCode: row.continentCode,
          continentName: row.continentName,
          lat: row.lat,
          lng: row.lng,
          population: Number(row.population) || 0,
        } satisfies CityItem,
      ]),
    );

    return cleanIds.map((id) => byId.get(id)).filter((item): item is CityItem => Boolean(item));
  }

  close(): void {
    if (!this.db) {
      return;
    }
    this.db.close();
    this.db = null;
  }

  private async rebuildCatalog(): Promise<CityCatalogStatus> {
    this.close();
    this.countryCacheByContinent.clear();
    try {
      await importGeoNamesCatalog({
        catalogDir: this.catalogDir,
        onProgress: (progress) => this.updateStatus(progress),
      });
      const readyStatus = this.readExistingStatus();
      this.updateStatus(readyStatus);
      return readyStatus;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.appendErrorLog(message);
      const next: CityCatalogStatus = {
        phase: 'error',
        percent: 0,
        message,
      };
      this.updateStatus(next);
      return next;
    } finally {
      this.inFlight = null;
    }
  }

  private readExistingStatus(): CityCatalogStatus {
    const catalogPath = this.getCatalogPath();
    if (!fs.existsSync(catalogPath)) {
      return {
        phase: 'idle',
        percent: 0,
        message: 'City catalog is not initialized.',
        updatedAtMs: null,
        rowCount: 0,
      };
    }

    const db = this.getDbOrNull();
    if (!db) {
      return {
        phase: 'idle',
        percent: 0,
        message: 'City catalog is not initialized.',
        updatedAtMs: null,
        rowCount: 0,
      };
    }

    const stats = this.readMetaRows(db);
    return {
      phase: 'ready',
      percent: 100,
      message: 'City catalog is ready.',
      updatedAtMs: stats.updatedAtMs,
      rowCount: stats.rowCount,
    };
  }

  private readMetaRows(db: Database.Database): CatalogMetaRows {
    const rows = db
      .prepare('SELECT key, value FROM city_meta WHERE key IN (?, ?)')
      .all('updatedAtMs', 'rowCount') as Array<{ key: string; value: string }>;

    const map = new Map(rows.map((row) => [row.key, row.value]));
    const updatedAtMsRaw = Number.parseInt(map.get('updatedAtMs') ?? '', 10);
    const rowCountRaw = Number.parseInt(map.get('rowCount') ?? '', 10);

    return {
      updatedAtMs: Number.isFinite(updatedAtMsRaw) ? updatedAtMsRaw : null,
      rowCount: Number.isFinite(rowCountRaw) ? rowCountRaw : 0,
    };
  }

  private getCatalogPath(): string {
    return path.join(this.catalogDir, CITY_CATALOG_FILENAME);
  }

  private getDbOrNull(): Database.Database | null {
    if (this.db && this.db.open) {
      return this.db;
    }

    const catalogPath = this.getCatalogPath();
    if (!fs.existsSync(catalogPath)) {
      return null;
    }

    this.db = new Database(catalogPath, { readonly: true, fileMustExist: true });
    return this.db;
  }

  private updateStatus(next: CityCatalogStatus): void {
    this.status = next;
    for (const listener of this.listeners) {
      listener(next);
    }
  }

  private async appendErrorLog(message: string): Promise<void> {
    try {
      await fsPromises.mkdir(this.logDir, { recursive: true });
      const logPath = path.join(this.logDir, 'city-catalog-errors.log');
      const line = `${new Date().toISOString()} ${message}\n`;
      await fsPromises.appendFile(logPath, line, 'utf8');
    } catch {
      // Ignore logging failures.
    }
  }
}
