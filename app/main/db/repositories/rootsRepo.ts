import type Database from 'better-sqlite3';

import type { RootRecord } from '@shared/types/photo';

export class RootsRepository {
  private readonly db: Database.Database;
  private readonly findByPathStmt;
  private readonly findByIdStmt;
  private readonly insertStmt;
  private readonly touchStmt;
  private readonly updateLastScanStmt;
  private readonly recentStmt;
  private readonly deleteStmt;
  private readonly listAllStmt;

  constructor(db: Database.Database) {
    this.db = db;
    this.findByPathStmt = db.prepare('SELECT * FROM roots WHERE path = ? LIMIT 1');
    this.findByIdStmt = db.prepare('SELECT * FROM roots WHERE id = ? LIMIT 1');
    this.insertStmt = db.prepare(
      'INSERT INTO roots (path, lastScanAtMs, createdAtMs, updatedAtMs) VALUES (@path, NULL, @createdAtMs, @updatedAtMs)',
    );
    this.touchStmt = db.prepare('UPDATE roots SET updatedAtMs = ? WHERE id = ?');
    this.updateLastScanStmt = db.prepare('UPDATE roots SET lastScanAtMs = ?, updatedAtMs = ? WHERE id = ?');
    this.recentStmt = db.prepare('SELECT * FROM roots ORDER BY updatedAtMs DESC LIMIT ?');
    this.deleteStmt = db.prepare('DELETE FROM roots WHERE id = ?');
    this.listAllStmt = db.prepare('SELECT * FROM roots ORDER BY updatedAtMs DESC');
  }

  ensure(path: string): RootRecord {
    const now = Date.now();
    const existing = this.findByPath(path);
    if (existing) {
      this.touchStmt.run(now, existing.id);
      return { ...existing, updatedAtMs: now };
    }

    const result = this.insertStmt.run({ path, createdAtMs: now, updatedAtMs: now });
    return {
      id: Number(result.lastInsertRowid),
      path,
      lastScanAtMs: null,
      createdAtMs: now,
      updatedAtMs: now,
    };
  }

  findByPath(path: string): RootRecord | null {
    const row = this.findByPathStmt.get(path) as RootRecord | undefined;
    return row ?? null;
  }

  findById(id: number): RootRecord | null {
    const row = this.findByIdStmt.get(id) as RootRecord | undefined;
    return row ?? null;
  }

  setLastScan(rootId: number, lastScanAtMs: number): void {
    this.updateLastScanStmt.run(lastScanAtMs, Date.now(), rootId);
  }

  listRecent(limit = 10): RootRecord[] {
    return this.recentStmt.all(limit) as RootRecord[];
  }

  listByIds(ids: number[]): RootRecord[] {
    const normalized = Array.from(new Set(ids.filter((id) => Number.isInteger(id) && id > 0)));
    if (normalized.length === 0) {
      return [];
    }
    const placeholders = normalized.map(() => '?').join(', ');
    const stmt = this.db.prepare(`SELECT * FROM roots WHERE id IN (${placeholders}) ORDER BY updatedAtMs DESC`);
    return stmt.all(...normalized) as RootRecord[];
  }

  listAll(): RootRecord[] {
    return this.listAllStmt.all() as RootRecord[];
  }

  deleteById(rootId: number): void {
    this.deleteStmt.run(rootId);
  }
}

