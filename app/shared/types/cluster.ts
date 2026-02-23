import type { Filters } from './settings';

export type ClusterItem = ClusterNode | PointNode;

export interface ClusterNode {
  type: 'cluster';
  id: number;
  lat: number;
  lng: number;
  count: number;
  representativePhotoId?: number;
  representativeMediaType?: 'photo' | 'video';
}

export interface PointNode {
  type: 'point';
  id: number;
  photoId: number;
  lat: number;
  lng: number;
  mediaType: 'photo' | 'video';
  groupKey?: string;
}

export interface ClusterQuery {
  bbox: [number, number, number, number];
  zoom: number;
  filters: Filters;
}
