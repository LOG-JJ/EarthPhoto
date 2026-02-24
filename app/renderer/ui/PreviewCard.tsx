import { useTranslation } from 'react-i18next';

import { usePreviewMediaSource } from '@renderer/application/media/usePreviewMediaSource';
import type { PreviewState } from '@renderer/domain/preview/previewModels';

interface PreviewCardProps {
  preview: PreviewState | null;
  isLoading?: boolean;
  onOpenPreview?: (photoId: number) => void;
}

export function PreviewCard({ preview, isLoading = false, onOpenPreview }: PreviewCardProps) {
  const { t } = useTranslation();
  const { resolvedSource, isConvertingHeic, handleImageError } = usePreviewMediaSource(preview);

  if (!preview || !resolvedSource) {
    return (
      <div className="empty-state">
        <p className="empty-state-title">{isLoading ? t('preview.loading') : t('preview.empty')}</p>
      </div>
    );
  }

  return (
    <div className="preview-card-wrapper">
      <img
        className="preview-image"
        src={resolvedSource}
        alt={`preview-${preview.photoId}`}
        loading="eager"
        decoding="async"
        title="Open source file"
        onClick={() => {
          if (onOpenPreview) onOpenPreview(preview.photoId);
        }}
        onError={() => void handleImageError()}
      />
      {isLoading ? <p className="preview-loading">{t('preview.loading')}</p> : null}
      {isConvertingHeic ? <p className="preview-loading">Converting HEIC to JPEG...</p> : null}
      <dl className="kv-grid">
        <dt>{t('preview.photoId')}</dt>
        <dd>{preview.photoId}</dd>
        <dt>{t('preview.mediaType')}</dt>
        <dd>{preview.mediaType}</dd>
      </dl>
    </div>
  );
}
