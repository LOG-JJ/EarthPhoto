import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import heic2any from 'heic2any';
import { useTranslation } from 'react-i18next';

type PreviewData = {
  photoId: number;
  mediaType: 'photo' | 'video';
  thumbPath: string;
};

type PreviewListItem = {
  photoId: number;
  mediaType: 'photo' | 'video';
  thumbPath: string | null;
};

interface PreviewPanelProps {
  preview: PreviewData | null;
  previews?: PreviewListItem[];
  isLoading?: boolean;
  onSelectPreview?: (photoId: number) => void;
  onOpenPreview?: (photoId: number) => void;
}

function toFileUrl(filePath: string): string {
  return `photoglobe://thumb?path=${encodeURIComponent(filePath)}`;
}

function toMediaUrl(filePath: string): string {
  return `photoglobe://media?path=${encodeURIComponent(filePath)}`;
}

function isHeicPath(filePath: string | null | undefined): boolean {
  if (!filePath) {
    return false;
  }
  return /\.hei(c|f)$/i.test(filePath);
}

export function PreviewPanel({
  preview,
  previews = [],
  isLoading = false,
  onSelectPreview,
  onOpenPreview,
}: PreviewPanelProps) {
  const { t } = useTranslation();

  const imageSource = useMemo(() => {
    if (!preview) {
      return null;
    }
    return toFileUrl(preview.thumbPath);
  }, [preview]);

  const [resolvedSource, setResolvedSource] = useState<string | null>(imageSource);
  const [isConvertingHeic, setIsConvertingHeic] = useState(false);
  const fallbackTriedPhotoIdRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const clearObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) {
      return;
    }
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  useEffect(() => {
    clearObjectUrl();
    setResolvedSource(imageSource);
    setIsConvertingHeic(false);
    fallbackTriedPhotoIdRef.current = null;
  }, [clearObjectUrl, imageSource, preview?.photoId]);

  useEffect(() => {
    return () => {
      clearObjectUrl();
    };
  }, [clearObjectUrl]);

  const tryHeicFallback = useCallback(async () => {
    if (!preview || preview.mediaType !== 'photo') {
      return;
    }
    if (fallbackTriedPhotoIdRef.current === preview.photoId) {
      return;
    }
    fallbackTriedPhotoIdRef.current = preview.photoId;

    try {
      setIsConvertingHeic(true);
      const source = await window.photoGlobe.media.getSource({ photoId: preview.photoId });
      if (!isHeicPath(source.path)) {
        return;
      }

      const response = await fetch(toMediaUrl(source.path));
      if (!response.ok) {
        throw new Error(`Failed to load HEIC media: ${response.status}`);
      }

      const originalBlob = await response.blob();
      const converted = await heic2any({
        blob: originalBlob,
        toType: 'image/jpeg',
        quality: 0.72,
      });
      const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
      if (!jpegBlob) {
        throw new Error('HEIC conversion returned empty blob');
      }

      clearObjectUrl();
      const objectUrl = URL.createObjectURL(jpegBlob);
      objectUrlRef.current = objectUrl;
      setResolvedSource(objectUrl);
    } catch (error) {
      console.error('HEIC to JPEG fallback failed', error);
    } finally {
      setIsConvertingHeic(false);
    }
  }, [clearObjectUrl, preview]);

  return (
    <section className="panel">
      <h3>{t('preview.title')}</h3>
      {!preview || !resolvedSource ? (
        isLoading ? (
          <p>{t('preview.loading')}</p>
        ) : (
          <p>{t('preview.empty')}</p>
        )
      ) : (
        <>
          <img
            className="preview-image"
            src={resolvedSource}
            alt={`preview-${preview.photoId}`}
            loading="eager"
            decoding="async"
            title="원본 파일 열기"
            onClick={() => {
              if (onOpenPreview) {
                onOpenPreview(preview.photoId);
              }
            }}
            onError={() => {
              void tryHeicFallback();
            }}
          />
          {isLoading ? <p className="preview-loading">{t('preview.loading')}</p> : null}
          {isConvertingHeic ? <p className="preview-loading">HEIC JPEG 변환 중...</p> : null}
          <dl className="kv-grid">
            <dt>{t('preview.photoId')}</dt>
            <dd>{preview.photoId}</dd>
            <dt>{t('preview.mediaType')}</dt>
            <dd>{preview.mediaType}</dd>
          </dl>
        </>
      )}
      {previews.length > 1 ? (
        <div className="preview-list-block">
          <p className="preview-list-title">
            {t('preview.title')} {previews.length}
          </p>
          <div className="preview-list-grid">
            {previews.map((item) => {
              const src = item.thumbPath ? toFileUrl(item.thumbPath) : null;
              const selected = preview?.photoId === item.photoId;
              return (
                <button
                  key={item.photoId}
                  type="button"
                  className={`preview-list-item${selected ? ' is-selected' : ''}`}
                  onClick={() => {
                    if (onSelectPreview) {
                      onSelectPreview(item.photoId);
                    }
                  }}
                >
                  {src ? (
                    <img src={src} alt={`preview-list-${item.photoId}`} loading="lazy" decoding="async" />
                  ) : (
                    <span className="preview-list-fallback">{item.mediaType.toUpperCase()}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}

