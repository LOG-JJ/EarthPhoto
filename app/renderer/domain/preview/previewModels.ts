export type MediaType = 'photo' | 'video';

export interface PreviewState {
  photoId: number;
  mediaType: MediaType;
  thumbPath: string;
}

export interface PreviewListItem {
  photoId: number;
  mediaType: MediaType;
  thumbPath: string | null;
  stripStatus: 'skeleton' | 'ready' | 'error';
}

export interface FlyToRequest {
  lat: number;
  lng: number;
  seq: number;
  targetHeight?: number;
  durationSec?: number;
}

export interface PreviewMember {
  photoId: number;
  mediaType: MediaType;
}

export function dedupePreviewMembers(members: PreviewMember[]): PreviewMember[] {
  return Array.from(new Map(members.map((item) => [item.photoId, item] as const)).values());
}
