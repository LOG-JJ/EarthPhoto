import type { ClusterItem } from '@shared/types/cluster';

export interface GlobePointDatum {
  type: 'cluster' | 'point';
  id: number;
  lat: number;
  lng: number;
  size: number;
  color: string;
  label: string;
  count?: number;
  photoId?: number;
  mediaType?: 'photo' | 'video';
  groupKey?: string;
  representativePhotoId?: number;
  representativeMediaType?: 'photo' | 'video';
}

export function buildPointData(items: ClusterItem[]): GlobePointDatum[] {
  return items.map((item) => {
    if (item.type === 'cluster') {
      const count = item.count;
      return {
        type: 'cluster',
        id: item.id,
        lat: item.lat,
        lng: item.lng,
        size: Math.min(0.48, 0.1 + Math.log10(count + 1) * 0.1),
        color: '#ff7a1a',
        label: `${count} files`,
        count,
        representativePhotoId: item.representativePhotoId,
        representativeMediaType: item.representativeMediaType,
      };
    }

    return {
      type: 'point',
      id: item.id,
      photoId: item.photoId,
      lat: item.lat,
      lng: item.lng,
      size: 0.056,
      color: item.mediaType === 'video' ? '#ff5a7d' : '#00c2ff',
      label: item.mediaType === 'video' ? 'Video' : 'Photo',
      mediaType: item.mediaType,
      groupKey: item.groupKey,
    };
  });
}
