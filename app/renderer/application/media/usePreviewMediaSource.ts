import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import heic2any from 'heic2any';

import type { PreviewState } from '@renderer/domain/preview/previewModels';
import type { PhotoGlobeGateway } from '@renderer/infrastructure/photoGlobeGateway';
import { windowPhotoGlobeGateway } from '@renderer/infrastructure/windowPhotoGlobeGateway';

function toFileUrl(filePath: string): string {
  return `photoglobe://thumb?path=${encodeURIComponent(filePath)}`;
}

function toMediaUrl(filePath: string): string {
  return `photoglobe://media?path=${encodeURIComponent(filePath)}`;
}

function isHeicPath(filePath: string | null | undefined): boolean {
  if (!filePath) return false;
  return /\.hei(c|f)$/i.test(filePath);
}

export function usePreviewMediaSource(
  preview: PreviewState | null,
  gateway: PhotoGlobeGateway = windowPhotoGlobeGateway,
) {
  const imageSource = useMemo(() => {
    if (!preview) return null;
    return toFileUrl(preview.thumbPath);
  }, [preview]);

  const [resolvedSource, setResolvedSource] = useState<string | null>(imageSource);
  const [isConvertingHeic, setIsConvertingHeic] = useState(false);
  const fallbackTriedPhotoIdRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const clearObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) return;
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
    return () => clearObjectUrl();
  }, [clearObjectUrl]);

  const handleImageError = useCallback(async () => {
    if (!preview || preview.mediaType !== 'photo') return;
    if (fallbackTriedPhotoIdRef.current === preview.photoId) return;
    fallbackTriedPhotoIdRef.current = preview.photoId;

    try {
      setIsConvertingHeic(true);
      const source = await gateway.mediaGetSource({ photoId: preview.photoId });
      if (!isHeicPath(source.path)) return;

      const response = await fetch(toMediaUrl(source.path));
      if (!response.ok) throw new Error(`Failed to load HEIC media: ${response.status}`);

      const originalBlob = await response.blob();
      const converted = await heic2any({ blob: originalBlob, toType: 'image/jpeg', quality: 0.72 });
      const jpegBlob = Array.isArray(converted) ? converted[0] : converted;
      if (!jpegBlob) throw new Error('HEIC conversion returned empty blob');

      clearObjectUrl();
      const objectUrl = URL.createObjectURL(jpegBlob);
      objectUrlRef.current = objectUrl;
      setResolvedSource(objectUrl);
    } catch (error) {
      console.error('HEIC to JPEG fallback failed', error);
    } finally {
      setIsConvertingHeic(false);
    }
  }, [clearObjectUrl, gateway, preview]);

  return {
    resolvedSource,
    isConvertingHeic,
    handleImageError,
  };
}
