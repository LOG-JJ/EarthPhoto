ALTER TABLE photos ADD COLUMN mediaType TEXT NOT NULL DEFAULT 'photo';
ALTER TABLE photos ADD COLUMN mime TEXT;
ALTER TABLE photos ADD COLUMN durationMs INTEGER;

CREATE INDEX IF NOT EXISTS idx_photos_media ON photos(mediaType);

