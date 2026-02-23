import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import https from 'node:https';
import path from 'node:path';
import readline from 'node:readline';

import type { CityCatalogStatus } from '@shared/types/ipc';

import { CITY_CATALOG_FILENAME, createCityCatalogDbClient } from './catalogDb';

interface CountryRow {
  countryCode: string;
  countryName: string;
  continentCode: string;
  continentName: string;
}

interface CityRow {
  cityId: string;
  geonameId: number;
  name: string;
  asciiName: string | null;
  normalizedName: string;
  countryCode: string;
  continentCode: string;
  lat: number;
  lng: number;
  population: number;
}

export interface CatalogImportResult {
  rowCount: number;
  updatedAtMs: number;
}

interface CatalogImportOptions {
  catalogDir: string;
  onProgress: (progress: CityCatalogStatus) => void;
}

const GEONAMES_COUNTRIES_URL = 'https://download.geonames.org/export/dump/countryInfo.txt';
const GEONAMES_CITIES_ZIP_URL = 'https://download.geonames.org/export/dump/allCountries.zip';

const CONTINENT_NAME_BY_CODE: Record<string, string> = {
  AF: 'Africa',
  AN: 'Antarctica',
  AS: 'Asia',
  EU: 'Europe',
  NA: 'North America',
  OC: 'Oceania',
  SA: 'South America',
};

function quoteForPowerShell(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

async function expandArchive(zipPath: string, outputDir: string): Promise<void> {
  await fsPromises.mkdir(outputDir, { recursive: true });
  const command = `Expand-Archive -Path ${quoteForPowerShell(zipPath)} -DestinationPath ${quoteForPowerShell(outputDir)} -Force`;
  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command], {
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `Expand-Archive failed with code ${String(code)}`));
    });
  });
}

async function downloadToFile(
  url: string,
  targetPath: string,
  onProgress?: (downloadedBytes: number, totalBytes: number | null) => void,
): Promise<void> {
  await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        response.resume();
        void downloadToFile(response.headers.location, targetPath, onProgress).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Failed to download ${url}: HTTP ${response.statusCode ?? 0}`));
        return;
      }

      const totalBytesHeader = response.headers['content-length'];
      const totalBytes =
        typeof totalBytesHeader === 'string'
          ? Number.parseInt(totalBytesHeader, 10)
          : Array.isArray(totalBytesHeader)
            ? Number.parseInt(totalBytesHeader[0], 10)
            : NaN;
      const hasTotal = Number.isFinite(totalBytes) && totalBytes > 0;
      const safeTotal = hasTotal ? totalBytes : null;
      let downloadedBytes = 0;

      const writeStream = fs.createWriteStream(targetPath);
      response.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        onProgress?.(downloadedBytes, safeTotal);
      });
      response.on('error', (error) => {
        writeStream.destroy(error);
      });
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
      response.pipe(writeStream);
    });

    request.on('error', reject);
  });
}

export function normalizeCityName(name: string, asciiName: string | null): string {
  const picked = (asciiName && asciiName.trim().length > 0 ? asciiName : name).trim();
  return picked
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function parseCountryInfoFile(countryInfoPath: string): Promise<Map<string, CountryRow>> {
  const map = new Map<string, CountryRow>();
  const stream = fs.createReadStream(countryInfoPath, { encoding: 'utf8' });
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of reader) {
    if (!line || line.startsWith('#')) {
      continue;
    }
    const fields = line.split('\t');
    const countryCode = fields[0]?.trim();
    const countryName = fields[4]?.trim();
    const continentCode = fields[8]?.trim();
    if (!countryCode || !countryName || !continentCode) {
      continue;
    }
    map.set(countryCode, {
      countryCode,
      countryName,
      continentCode,
      continentName: CONTINENT_NAME_BY_CODE[continentCode] ?? continentCode,
    });
  }

  return map;
}

async function cleanupTempFiles(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async (entryPath) => {
      try {
        await fsPromises.rm(entryPath, { recursive: true, force: true });
      } catch {
        // Ignore cleanup failures.
      }
    }),
  );
}

async function replaceCatalogFile(tmpPath: string, finalPath: string): Promise<void> {
  const backupPath = `${finalPath}.bak`;
  try {
    await fsPromises.rm(backupPath, { force: true });
  } catch {
    // Ignore stale backup delete failure.
  }

  let movedExisting = false;
  try {
    await fsPromises.access(finalPath);
    await fsPromises.rename(finalPath, backupPath);
    movedExisting = true;
  } catch {
    movedExisting = false;
  }

  try {
    await fsPromises.rename(tmpPath, finalPath);
    if (movedExisting) {
      await fsPromises.rm(backupPath, { force: true });
    }
  } catch (error) {
    if (movedExisting) {
      try {
        await fsPromises.rename(backupPath, finalPath);
      } catch {
        // Best-effort rollback.
      }
    }
    throw error;
  }
}

export async function importGeoNamesCatalog(options: CatalogImportOptions): Promise<CatalogImportResult> {
  const { catalogDir, onProgress } = options;
  await fsPromises.mkdir(catalogDir, { recursive: true });

  const workId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempDir = path.join(catalogDir, `.tmp-${workId}`);
  const extractDir = path.join(tempDir, 'extract');
  const countryInfoPath = path.join(tempDir, 'countryInfo.txt');
  const zipPath = path.join(tempDir, 'allCountries.zip');
  const tempCatalogFileName = `${CITY_CATALOG_FILENAME}.tmp`;
  const finalCatalogPath = path.join(catalogDir, CITY_CATALOG_FILENAME);
  const tmpCatalogPath = path.join(catalogDir, tempCatalogFileName);

  await fsPromises.mkdir(tempDir, { recursive: true });

  try {
    onProgress({
      phase: 'downloading',
      percent: 0,
      message: 'Downloading country metadata...',
    });
    await downloadToFile(GEONAMES_COUNTRIES_URL, countryInfoPath);
    onProgress({
      phase: 'downloading',
      percent: 6,
      message: 'Downloading city catalog...',
    });

    await downloadToFile(GEONAMES_CITIES_ZIP_URL, zipPath, (downloaded, total) => {
      const ratio = total && total > 0 ? Math.min(1, downloaded / total) : 0;
      onProgress({
        phase: 'downloading',
        percent: Math.min(58, 6 + ratio * 52),
        message: total ? `Downloading city catalog (${Math.floor(ratio * 100)}%)...` : 'Downloading city catalog...',
      });
    });

    onProgress({
      phase: 'importing',
      percent: 60,
      message: 'Extracting archive...',
    });
    await expandArchive(zipPath, extractDir);

    const allCountriesPath = path.join(extractDir, 'allCountries.txt');
    const countryByCode = await parseCountryInfoFile(countryInfoPath);
    if (countryByCode.size === 0) {
      throw new Error('Country metadata is empty.');
    }

    await fsPromises.rm(tmpCatalogPath, { force: true });
    const cityDb = createCityCatalogDbClient(catalogDir, tempCatalogFileName);
    const insertCountryStmt = cityDb.db.prepare(`
      INSERT INTO country_catalog (countryCode, countryName, continentCode, continentName)
      VALUES (@countryCode, @countryName, @continentCode, @continentName)
      ON CONFLICT(countryCode) DO UPDATE SET
        countryName = excluded.countryName,
        continentCode = excluded.continentCode,
        continentName = excluded.continentName
    `);
    const insertCityStmt = cityDb.db.prepare(`
      INSERT INTO city_catalog (
        cityId, geonameId, name, asciiName, normalizedName,
        countryCode, continentCode, lat, lng, population
      ) VALUES (
        @cityId, @geonameId, @name, @asciiName, @normalizedName,
        @countryCode, @continentCode, @lat, @lng, @population
      )
    `);
    const upsertMetaStmt = cityDb.db.prepare(`
      INSERT INTO city_meta (key, value)
      VALUES (@key, @value)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    const insertCountriesTx = cityDb.db.transaction((rows: CountryRow[]) => {
      for (const row of rows) {
        insertCountryStmt.run(row);
      }
    });
    insertCountriesTx(Array.from(countryByCode.values()));

    const insertCitiesTx = cityDb.db.transaction((rows: CityRow[]) => {
      for (const row of rows) {
        insertCityStmt.run(row);
      }
    });

    const totalBytes = (await fsPromises.stat(allCountriesPath)).size;
    const stream = fs.createReadStream(allCountriesPath, { encoding: 'utf8' });
    const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });
    const batchSize = 2_000;
    let currentBatch: CityRow[] = [];
    let processedBytes = 0;
    let importedRows = 0;

    for await (const line of reader) {
      processedBytes += Buffer.byteLength(line, 'utf8') + 1;
      if (!line || line.startsWith('#')) {
        continue;
      }

      const fields = line.split('\t');
      if (fields.length < 15) {
        continue;
      }

      const featureClass = fields[6]?.trim();
      if (featureClass !== 'P') {
        continue;
      }

      const geonameId = Number.parseInt(fields[0] ?? '', 10);
      const name = (fields[1] ?? '').trim();
      const asciiNameRaw = (fields[2] ?? '').trim();
      const lat = Number.parseFloat(fields[4] ?? '');
      const lng = Number.parseFloat(fields[5] ?? '');
      const countryCode = (fields[8] ?? '').trim();
      const population = Number.parseInt(fields[14] ?? '0', 10);
      const country = countryByCode.get(countryCode);

      if (!country || !Number.isFinite(geonameId) || !name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }

      currentBatch.push({
        cityId: String(geonameId),
        geonameId,
        name,
        asciiName: asciiNameRaw.length > 0 ? asciiNameRaw : null,
        normalizedName: normalizeCityName(name, asciiNameRaw.length > 0 ? asciiNameRaw : null),
        countryCode: country.countryCode,
        continentCode: country.continentCode,
        lat,
        lng,
        population: Number.isFinite(population) ? Math.max(0, population) : 0,
      });

      if (currentBatch.length >= batchSize) {
        insertCitiesTx(currentBatch);
        importedRows += currentBatch.length;
        currentBatch = [];

        const ratio = totalBytes > 0 ? Math.min(1, processedBytes / totalBytes) : 0;
        onProgress({
          phase: 'importing',
          percent: Math.min(99, 60 + ratio * 39),
          rowCount: importedRows,
          message: `Importing cities (${importedRows.toLocaleString()} rows)...`,
        });
      }
    }

    if (currentBatch.length > 0) {
      insertCitiesTx(currentBatch);
      importedRows += currentBatch.length;
    }

    const updatedAtMs = Date.now();
    upsertMetaStmt.run({ key: 'catalogVersion', value: `geonames-${updatedAtMs}` });
    upsertMetaStmt.run({ key: 'updatedAtMs', value: String(updatedAtMs) });
    upsertMetaStmt.run({ key: 'rowCount', value: String(importedRows) });
    cityDb.close();

    await replaceCatalogFile(tmpCatalogPath, finalCatalogPath);

    onProgress({
      phase: 'ready',
      percent: 100,
      rowCount: importedRows,
      updatedAtMs,
      message: 'City catalog is ready.',
    });

    return {
      rowCount: importedRows,
      updatedAtMs,
    };
  } finally {
    await cleanupTempFiles([tempDir, tmpCatalogPath]);
  }
}
