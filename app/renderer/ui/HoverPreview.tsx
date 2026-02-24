import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { HoverPreviewInfo } from '@shared/types/ipc';

interface HoverPreviewProps {
  preview: (HoverPreviewInfo & { photoId: number }) | null;
  isLoading?: boolean;
}

function toPreviewUrl(filePath: string): string {
  return `photoglobe://thumb?path=${encodeURIComponent(filePath)}`;
}

export function HoverPreview({ preview, isLoading = false }: HoverPreviewProps) {
  const { t } = useTranslation();
  const source = useMemo(() => {
    if (!preview) {
      return null;
    }
    return toPreviewUrl(preview.path);
  }, [preview]);

  if (!preview && !isLoading) {
    return null;
  }

  return (
    <aside className="hover-preview">
      <h4>{t('hover.title')}</h4>
      {source ? (
        preview?.kind === 'video' ? (
          <video
            className="hover-preview-image"
            src={source}
            muted
            loop
            autoPlay
            playsInline
          />
        ) : (
          <img className="hover-preview-image" src={source} alt={`hover-preview-${preview?.photoId ?? 'media'}`} />
        )
      ) : (
        <p>{t('hover.loading')}</p>
      )}
    </aside>
  );
}
