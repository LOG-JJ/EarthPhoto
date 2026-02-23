import { useMemo } from 'react';

interface HoverPreviewProps {
  preview: { photoId: number; path: string; kind: 'image' | 'video' } | null;
  isLoading?: boolean;
}

function toPreviewUrl(filePath: string): string {
  return `photoglobe://thumb?path=${encodeURIComponent(filePath)}`;
}

export function HoverPreview({ preview, isLoading = false }: HoverPreviewProps) {
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
      <h4>Hover Preview</h4>
      {source ? (
        <img className="hover-preview-image" src={source} alt={`hover-preview-${preview?.photoId ?? 'media'}`} />
      ) : (
        <p>Loading...</p>
      )}
    </aside>
  );
}
