import { exiftool } from 'exiftool-vendored';
import sharp from 'sharp';

const EMBEDDED_PREVIEW_TAGS = ['PreviewImage', 'JpgFromRaw', 'ThumbnailImage', 'OtherImage', 'CoverArt'] as const;

interface EmbeddedPreviewOptions {
  rotate?: boolean;
  quality?: number;
  effort?: number;
}

export async function createThumbnailFromEmbeddedPreview(
  sourcePath: string,
  targetPath: string,
  size: number,
  options: EmbeddedPreviewOptions = {},
): Promise<boolean> {
  const rotate = options.rotate !== false;
  const quality = options.quality ?? (size <= 128 ? 70 : size <= 256 ? 78 : 82);
  void options.effort;

  for (const tag of EMBEDDED_PREVIEW_TAGS) {
    try {
      const buffer = await exiftool.extractBinaryTagToBuffer(tag, sourcePath);
      if (!buffer || buffer.length === 0) {
        continue;
      }
      let pipeline = sharp(buffer, { failOn: 'none', sequentialRead: true });
      if (rotate) {
        pipeline = pipeline.rotate();
      }
      await pipeline
        .resize(size, size, {
          fit: 'cover',
          position: 'centre',
          withoutEnlargement: false,
          fastShrinkOnLoad: true,
        })
        .jpeg({ quality, mozjpeg: true, progressive: false })
        .toFile(targetPath);
      return true;
    } catch {
      // Try next embedded preview tag.
    }
  }
  return false;
}
