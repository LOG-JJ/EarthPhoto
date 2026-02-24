import { useTranslation } from 'react-i18next';

import type { PreviewListItem, PreviewState } from '@renderer/domain/preview/previewModels';

import { PreviewCard } from './PreviewCard';
import { PreviewList } from './PreviewList';

interface PreviewPanelProps {
  preview: PreviewState | null;
  previews?: PreviewListItem[];
  isLoading?: boolean;
  onSelectPreview?: (photoId: number) => void;
  onOpenPreview?: (photoId: number) => void;
}

export function PreviewPanel({
  preview,
  previews = [],
  isLoading = false,
  onSelectPreview,
  onOpenPreview,
}: PreviewPanelProps) {
  const { t } = useTranslation();

  return (
    <section className="panel">
      <h3>{t('preview.title')}</h3>
      <PreviewCard preview={preview} isLoading={isLoading} onOpenPreview={onOpenPreview} />
      <PreviewList previews={previews} currentPreview={preview} onSelectPreview={onSelectPreview} />
    </section>
  );
}
