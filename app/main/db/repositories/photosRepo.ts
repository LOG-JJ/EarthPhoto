import path from 'node:path';

import type Database from 'better-sqlite3';

import type { PointItem, PhotoRecord, PhotoUpsertInput } from '@shared/types/photo';
import type { Filters } from '@shared/types/settings';
import { normalizeFsPath } from '@shared/utils/path';

export interface ExistingPhotoSnapshot {
  id: number;
  path: string;
  mtimeMs: number;
  sizeBytes: number;
}

interface FilterSql {
  where: string;
  params: unknown[];
}

export class PhotosRepository {
  private readonly upsertStmt;
  private readonly markDeletedStmt;
  private readonly restoreStmt;
  private readonly byIdStmt;
  private readonly updateThumbStmt;
  private readonly setErrorStmt;
  private readonly clearErrorStmt;

  constructor(private readonly db: Database.Database) {
    this.upsertStmt = db.prepare(`
      INSERT INTO photos (
        rootId,
        path,
        pathHash,
        sizeBytes,
        mtimeMs,
        mediaType,
        mime,
        lat,
        lng,
        alt,
        takenAtMs,
        width,
        height,
        durationMs,
        cameraModel,
        thumbPath,
        thumbUpdatedAtMs,
        isDeleted,
        lastIndexedAtMs,
        lastError
      ) VALUES (
        @rootId,
        @path,
        @pathHash,
        @sizeBytes,
        @mtimeMs,
        @mediaType,
        @mime,
        @lat,
        @lng,
        @alt,
        @takenAtMs,
        @width,
        @height,
        @durationMs,
        @cameraModel,
        @thumbPath,
        @thumbUpdatedAtMs,
        0,
        @lastIndexedAtMs,
        @lastError
      )
      ON CONFLICT(path) DO UPDATE SET
        rootId = excluded.rootId,
        pathHash = excluded.pathHash,
        sizeBytes = excluded.sizeBytes,
        mtimeMs = excluded.mtimeMs,
        mediaType = excluded.mediaType,
        mime = excluded.mime,
        lat = excluded.lat,
        lng = excluded.lng,
        alt = excluded.alt,
        takenAtMs = excluded.takenAtMs,
        width = excluded.width,
        height = excluded.height,
        durationMs = excluded.durationMs,
        cameraModel = excluded.cameraModel,
        thumbPath = COALESCE(photos.thumbPath, excluded.thumbPath),
        thumbUpdatedAtMs = CASE
          WHEN excluded.thumbPath IS NOT NULL THEN excluded.thumbUpdatedAtMs
          ELSE photos.thumbUpdatedAtMs
        END,
        isDeleted = 0,
        lastIndexedAtMs = excluded.lastIndexedAtMs,
        lastError = excluded.lastError
    `);

    this.markDeletedStmt = db.prepare('UPDATE photos SET isDeleted = 1 WHERE rootId = ?');
    this.restoreStmt = db.prepare('UPDATE photos SET isDeleted = 0, lastIndexedAtMs = ? WHERE path = ?');
    this.byIdStmt = db.prepare('SELECT * FROM photos WHERE id = ? LIMIT 1');
    this.updateThumbStmt = db.prepare(
      'UPDATE photos SET thumbPath = @thumbPath, thumbUpdatedAtMs = @thumbUpdatedAtMs, lastError = NULL WHERE id = @id',
    );
    this.setErrorStmt = db.prepare('UPDATE photos SET lastError = @lastError WHERE id = @id');
    this.clearErrorStmt = db.prepare('UPDATE photos SET lastError = NULL WHERE id = @id');
  }

  getExistingByRoot(rootId: number): Map<string, ExistingPhotoSnapshot> {
    const rows = this.db.prepare('SELECT id, path, mtimeMs, sizeBytes FROM photos WHERE rootId = ?').all(rootId) as
      | ExistingPhotoSnapshot[]
      | undefined;
    const map = new Map<string, ExistingPhotoSnapshot>();
    for (const row of rows ?? []) {
      map.set(normalizeFsPath(row.path), row);
    }
    return map;
  }

  markAllDeleted(rootId: number): void {
    this.markDeletedStmt.run(rootId);
  }

  restoreUnchanged(paths: string[], lastIndexedAtMs: number): void {
    if (paths.length === 0) {
      return;
    }
    const tx = this.db.transaction((items: string[]) => {
      for (const item of items) {
        this.restoreStmt.run(lastIndexedAtMs, item);
      }
    });
    tx(paths);
  }

  upsertBatch(records: PhotoUpsertInput[]): void {
    if (records.length === 0) {
      return;
    }
    const tx = this.db.transaction((rows: PhotoUpsertInput[]) => {
      for (const row of rows) {
        this.upsertStmt.run(row);
      }
    });
    tx(records);
  }

  getById(id: number): PhotoRecord | null {
    const row = this.byIdStmt.get(id) as PhotoRecord | undefined;
    return row ?? null;
  }

  updateThumbnail(id: number, thumbPath: string): void {
    this.updateThumbStmt.run({ id, thumbPath, thumbUpdatedAtMs: Date.now() });
  }

  setError(id: number, errorText: string): void {
    this.setErrorStmt.run({ id, lastError: errorText });
  }

  clearError(id: number): void {
    this.clearErrorStmt.run({ id });
  }

  getPointsInBbox(
    bbox: [number, number, number, number],
    filters: Filters,
    limit: number,
    offset: number,
  ): PointItem[] {
    const [west, south, east, north] = bbox;
    const filterSql = this.buildFilterSql(filters, true);
    const sql = `
      SELECT id, lat, lng, mediaType, takenAtMs, path, thumbPath
      FROM photos
      WHERE ${filterSql.where}
        AND lat BETWEEN ? AND ?
        AND lng BETWEEN ? AND ?
      ORDER BY takenAtMs DESC NULLS LAST, id DESC
      LIMIT ?
      OFFSET ?
    `;

    const rows = this.db
      .prepare(sql)
      .all(...filterSql.params, south, north, west, east, limit, offset) as Array<
      Omit<PointItem, 'lat' | 'lng'> & { lat: number; lng: number }
    >;

    return rows.map((row) => ({ ...row, lat: Number(row.lat), lng: Number(row.lng) }));
  }

  getAllGeoPoints(
    filters: Filters,
  ): Array<{ id: number; lat: number; lng: number; mediaType: 'photo' | 'video'; sortKey: string; groupKey: string }> {
    const filterSql = this.buildFilterSql(filters, true);
    const sql = `
      SELECT id, lat, lng, mediaType, path
      FROM photos
      WHERE ${filterSql.where}
    `;
    const rows = this.db.prepare(sql).all(...filterSql.params) as Array<{
      id: number;
      lat: number;
      lng: number;
      mediaType: 'photo' | 'video';
      path: string;
    }>;
    return rows.map((row) => ({
      id: row.id,
      lat: row.lat,
      lng: row.lng,
      mediaType: row.mediaType,
      sortKey: path.basename(row.path).toLowerCase(),
      groupKey: `${Number(row.lat).toFixed(6)}:${Number(row.lng).toFixed(6)}`,
    }));
  }

  countPrefetchTargets(filters: Filters): number {
    const filterSql = this.buildFilterSql(filters, true);
    const sql = `SELECT COUNT(1) as count FROM photos WHERE ${filterSql.where}`;
    const row = this.db.prepare(sql).get(...filterSql.params) as { count: number } | undefined;
    return row?.count ?? 0;
  }

  getPrefetchTargetIds(filters: Filters, limit: number, offset: number): number[] {
    const safeLimit = Math.max(1, Math.min(1_000, Math.trunc(limit)));
    const safeOffset = Math.max(0, Math.trunc(offset));
    const filterSql = this.buildFilterSql(filters, true);
    const sql = `
      SELECT id
      FROM photos
      WHERE ${filterSql.where}
      ORDER BY id ASC
      LIMIT ?
      OFFSET ?
    `;
    const rows = this.db.prepare(sql).all(...filterSql.params, safeLimit, safeOffset) as Array<{
      id: number;
    }>;
    return rows.map((row) => row.id);
  }

  private buildFilterSql(filters: Filters, requireGps: boolean): FilterSql {
    const where: string[] = ['isDeleted = 0'];
    const params: unknown[] = [];

    if (requireGps || filters.hasGps === true) {
      where.push('lat IS NOT NULL', 'lng IS NOT NULL');
    } else if (filters.hasGps === false) {
      where.push('(lat IS NULL OR lng IS NULL)');
    }

    if (filters.rootIds && filters.rootIds.length > 0) {
      const placeholders = filters.rootIds.map(() => '?').join(', ');
      where.push(`rootId IN (${placeholders})`);
      params.push(...filters.rootIds);
    }

    if (filters.mediaTypes && filters.mediaTypes.length > 0) {
      const placeholders = filters.mediaTypes.map(() => '?').join(', ');
      where.push(`mediaType IN (${placeholders})`);
      params.push(...filters.mediaTypes);
    }

    if (typeof filters.dateFromMs === 'number') {
      where.push('takenAtMs >= ?');
      params.push(filters.dateFromMs);
    }

    if (typeof filters.dateToMs === 'number') {
      where.push('takenAtMs <= ?');
      params.push(filters.dateToMs);
    }

    return {
      where: where.join(' AND '),
      params,
    };
  }
}
