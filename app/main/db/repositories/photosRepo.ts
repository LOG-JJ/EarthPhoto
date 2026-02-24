import path from 'node:path';

import type Database from 'better-sqlite3';

import type { DateMediaCountItem, TimelineExtentInfo, TripPoint } from '@shared/types/ipc';
import type { PointItem, PhotoRecord, PhotoUpsertInput } from '@shared/types/photo';
import type { Filters } from '@shared/types/settings';
import { normalizeFsPath } from '@shared/utils/path';

export interface ExistingPhotoSnapshot {
  id: number;
  path: string;
  mtimeMs: number;
  sizeBytes: number;
  isDeleted: number;
}

export interface PhotoMetadataPatchInput {
  rootId: number;
  path: string;
  lat: number | null;
  lng: number | null;
  alt: number | null;
  takenAtMs: number | null;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  cameraModel: string | null;
  lastIndexedAtMs: number;
  lastError: string | null;
}

interface FilterSql {
  where: string;
  params: unknown[];
}

export class PhotosRepository {
  private readonly upsertStmt;
  private readonly markDeletedByPathStmt;
  private readonly restoreByPathStmt;
  private readonly patchMetadataStmt;
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

    this.markDeletedByPathStmt = db.prepare(
      'UPDATE photos SET isDeleted = 1, lastIndexedAtMs = @lastIndexedAtMs WHERE rootId = @rootId AND path = @path',
    );
    this.restoreByPathStmt = db.prepare(
      'UPDATE photos SET isDeleted = 0, lastIndexedAtMs = @lastIndexedAtMs WHERE path = @path',
    );
    this.patchMetadataStmt = db.prepare(`
      UPDATE photos
      SET
        lat = COALESCE(@lat, lat),
        lng = COALESCE(@lng, lng),
        alt = COALESCE(@alt, alt),
        takenAtMs = COALESCE(@takenAtMs, takenAtMs),
        width = COALESCE(@width, width),
        height = COALESCE(@height, height),
        durationMs = COALESCE(@durationMs, durationMs),
        cameraModel = COALESCE(@cameraModel, cameraModel),
        lastIndexedAtMs = @lastIndexedAtMs,
        lastError = @lastError
      WHERE rootId = @rootId AND path = @path
    `);
    this.byIdStmt = db.prepare('SELECT * FROM photos WHERE id = ? LIMIT 1');
    this.updateThumbStmt = db.prepare(
      'UPDATE photos SET thumbPath = @thumbPath, thumbUpdatedAtMs = @thumbUpdatedAtMs, lastError = NULL WHERE id = @id',
    );
    this.setErrorStmt = db.prepare('UPDATE photos SET lastError = @lastError WHERE id = @id');
    this.clearErrorStmt = db.prepare('UPDATE photos SET lastError = NULL WHERE id = @id');
  }

  getExistingByRoot(rootId: number): Map<string, ExistingPhotoSnapshot> {
    const rows = this.db.prepare('SELECT id, path, mtimeMs, sizeBytes, isDeleted FROM photos WHERE rootId = ?').all(rootId) as
      | ExistingPhotoSnapshot[]
      | undefined;
    const map = new Map<string, ExistingPhotoSnapshot>();
    for (const row of rows ?? []) {
      map.set(normalizeFsPath(row.path), row);
    }
    return map;
  }

  markDeletedByPaths(rootId: number, paths: string[], lastIndexedAtMs: number): void {
    if (paths.length === 0) {
      return;
    }
    const tx = this.db.transaction((items: string[]) => {
      for (const item of items) {
        this.markDeletedByPathStmt.run({ rootId, path: item, lastIndexedAtMs });
      }
    });
    tx(paths);
  }

  restoreByPaths(paths: string[], lastIndexedAtMs: number): void {
    if (paths.length === 0) {
      return;
    }
    const tx = this.db.transaction((items: string[]) => {
      for (const item of items) {
        this.restoreByPathStmt.run({ path: item, lastIndexedAtMs });
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

  patchMetadataBatch(records: PhotoMetadataPatchInput[]): void {
    if (records.length === 0) {
      return;
    }
    const tx = this.db.transaction((rows: PhotoMetadataPatchInput[]) => {
      for (const row of rows) {
        this.patchMetadataStmt.run(row);
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

  getTimelineExtent(filters: Filters): TimelineExtentInfo {
    const filterSql = this.buildFilterSql(filters, true);
    const sql = `
      SELECT
        MIN(takenAtMs) AS minMs,
        MAX(takenAtMs) AS maxMs,
        SUM(CASE WHEN takenAtMs IS NOT NULL THEN 1 ELSE 0 END) AS datedCount,
        SUM(CASE WHEN takenAtMs IS NULL THEN 1 ELSE 0 END) AS undatedCount
      FROM photos
      WHERE ${filterSql.where}
    `;
    const row = this.db.prepare(sql).get(...filterSql.params) as
      | { minMs: number | null; maxMs: number | null; datedCount: number | null; undatedCount: number | null }
      | undefined;
    return {
      minMs: row?.minMs ?? null,
      maxMs: row?.maxMs ?? null,
      datedCount: row?.datedCount ?? 0,
      undatedCount: row?.undatedCount ?? 0,
    };
  }

  getDailyCounts(filters: Filters, limit = 730): DateMediaCountItem[] {
    const safeLimit = Math.max(1, Math.min(5_000, Math.trunc(limit) || 730));
    const filterSql = this.buildFilterSql(filters, false);
    const sql = `
      SELECT
        strftime('%Y-%m-%d', datetime(takenAtMs / 1000, 'unixepoch', 'localtime')) AS date,
        SUM(CASE WHEN mediaType = 'photo' THEN 1 ELSE 0 END) AS photoCount,
        SUM(CASE WHEN mediaType = 'video' THEN 1 ELSE 0 END) AS videoCount,
        COUNT(1) AS totalCount
      FROM photos
      WHERE ${filterSql.where}
        AND takenAtMs IS NOT NULL
      GROUP BY date
      ORDER BY date DESC
      LIMIT ?
    `;
    const rows = this.db.prepare(sql).all(...filterSql.params, safeLimit) as Array<{
      date: string;
      photoCount: number;
      videoCount: number;
      totalCount: number;
    }>;
    return rows.map((row) => ({
      date: row.date,
      photoCount: row.photoCount ?? 0,
      videoCount: row.videoCount ?? 0,
      totalCount: row.totalCount ?? 0,
    }));
  }

  getTripPoints(filters: Filters): TripPoint[] {
    const filterSql = this.buildFilterSql(filters, true);
    const sql = `
      SELECT id AS photoId, lat, lng, takenAtMs, mediaType
      FROM photos
      WHERE ${filterSql.where}
        AND takenAtMs IS NOT NULL
      ORDER BY takenAtMs ASC, id ASC
    `;
    const rows = this.db.prepare(sql).all(...filterSql.params) as Array<{
      photoId: number;
      lat: number;
      lng: number;
      takenAtMs: number;
      mediaType: 'photo' | 'video';
    }>;
    return rows;
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

    const dateClauses: string[] = [];
    const dateParams: unknown[] = [];
    if (typeof filters.dateFromMs === 'number') {
      dateClauses.push('takenAtMs >= ?');
      dateParams.push(filters.dateFromMs);
    }
    if (typeof filters.dateToMs === 'number') {
      dateClauses.push('takenAtMs <= ?');
      dateParams.push(filters.dateToMs);
    }
    if (dateClauses.length > 0) {
      if (filters.includeUndated) {
        where.push(`((${dateClauses.join(' AND ')}) OR takenAtMs IS NULL)`);
      } else {
        where.push(dateClauses.join(' AND '));
      }
      params.push(...dateParams);
    }

    const cameraQuery = filters.cameraModelQuery?.trim().toLowerCase() ?? '';
    if (cameraQuery.length > 0) {
      where.push("LOWER(COALESCE(cameraModel, '')) LIKE ?");
      params.push(`%${cameraQuery}%`);
    }

    if (typeof filters.minWidthPx === 'number' && Number.isFinite(filters.minWidthPx)) {
      where.push('width IS NOT NULL', 'width >= ?');
      params.push(filters.minWidthPx);
    }

    if (typeof filters.minHeightPx === 'number' && Number.isFinite(filters.minHeightPx)) {
      where.push('height IS NOT NULL', 'height >= ?');
      params.push(filters.minHeightPx);
    }

    if (typeof filters.durationFromMs === 'number' && Number.isFinite(filters.durationFromMs)) {
      where.push('durationMs IS NOT NULL', 'durationMs >= ?');
      params.push(filters.durationFromMs);
    }

    if (typeof filters.durationToMs === 'number' && Number.isFinite(filters.durationToMs)) {
      where.push('durationMs IS NOT NULL', 'durationMs <= ?');
      params.push(filters.durationToMs);
    }

    return {
      where: where.join(' AND '),
      params,
    };
  }
}
