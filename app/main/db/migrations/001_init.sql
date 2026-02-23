CREATE TABLE IF NOT EXISTS roots (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  lastScanAtMs INTEGER,
  createdAtMs INTEGER NOT NULL,
  updatedAtMs INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS photos (
  id INTEGER PRIMARY KEY,
  rootId INTEGER NOT NULL,
  path TEXT UNIQUE NOT NULL,
  pathHash TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  mtimeMs INTEGER NOT NULL,
  lat REAL,
  lng REAL,
  alt REAL,
  takenAtMs INTEGER,
  width INTEGER,
  height INTEGER,
  cameraModel TEXT,
  thumbPath TEXT,
  thumbUpdatedAtMs INTEGER,
  isDeleted INTEGER NOT NULL DEFAULT 0,
  lastIndexedAtMs INTEGER NOT NULL,
  lastError TEXT,
  FOREIGN KEY(rootId) REFERENCES roots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_photos_geo ON photos(lat, lng);
CREATE INDEX IF NOT EXISTS idx_photos_takenAt ON photos(takenAtMs);
CREATE INDEX IF NOT EXISTS idx_photos_root_mtime ON photos(rootId, mtimeMs);
CREATE INDEX IF NOT EXISTS idx_photos_deleted ON photos(isDeleted);

