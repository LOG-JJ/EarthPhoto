import SuperclusterModule from 'supercluster';

import { PhotosRepository } from '@main/db/repositories/photosRepo';
import type { ClusterItem } from '@shared/types/cluster';
import type { GetClusterMembersPayload, GetClustersPayload, GetPointsPayload } from '@shared/types/ipc';
import type { PointItem } from '@shared/types/photo';
import type { Filters } from '@shared/types/settings';
import { clampLat, clampLng, normalizeBbox } from '@shared/utils/geo';

import { ClusterCache } from './clusterCache';

interface PointProps {
  photoId: number;
  mediaType: 'photo' | 'video';
  groupKey?: string;
  representativePhotoId?: number;
  representativeMediaType?: 'photo' | 'video';
  representativeName?: string;
}

const SuperclusterCtor = (
  (SuperclusterModule as unknown as { default?: unknown }).default ?? SuperclusterModule
) as new (options?: any) => any;

interface ClusterProps {
  cluster: true;
  cluster_id: number;
  point_count: number;
  [key: string]: unknown;
}

interface ClusterSnapshot {
  index: any;
}

interface GeoPoint {
  id: number;
  lat: number;
  lng: number;
  mediaType: 'photo' | 'video';
  sortKey: string;
  groupKey: string;
}

interface LeafFeature {
  geometry?: {
    coordinates?: [number, number];
  };
  properties?: {
    photoId?: number;
    mediaType?: 'photo' | 'video';
    groupKey?: string;
  };
}

interface LeafPoint {
  photoId: number;
  lat: number;
  lng: number;
  mediaType: 'photo' | 'video';
  groupKey?: string;
}

const FORCE_EXPAND_CLUSTER_ZOOM = 18;
const FORCE_EXPAND_CLUSTER_MAX_COUNT = 1_600;
const DENSE_CLUSTER_SPAN_THRESHOLD = 0.00095; // approx 100m

function spreadOverlappingPoints(points: GeoPoint[]): GeoPoint[] {
  const buckets = new Map<string, GeoPoint[]>();
  for (const point of points) {
    const key = `${point.lat.toFixed(6)}:${point.lng.toFixed(6)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(point);
      continue;
    }
    buckets.set(key, [point]);
  }

  const spread: GeoPoint[] = [];
  for (const bucket of buckets.values()) {
    if (bucket.length === 1) {
      spread.push(bucket[0]);
      continue;
    }

    const sorted = [...bucket].sort((a, b) => a.id - b.id);
    for (let index = 0; index < sorted.length; index += 1) {
      const item = sorted[index];
      const ring = Math.floor(index / 14) + 1;
      const angle = ((index % 14) / 14) * Math.PI * 2;
      const radius = ring * 0.00018; // around 18m per ring near equator
      const latOffset = Math.sin(angle) * radius;
      const lngOffset = (Math.cos(angle) * radius) / Math.max(0.2, Math.cos((item.lat * Math.PI) / 180));
      spread.push({
        ...item,
        lat: clampLat(item.lat + latOffset),
        lng: clampLng(item.lng + lngOffset),
      });
    }
  }

  return spread;
}

function spreadDenseLeafPoints(points: LeafPoint[]): LeafPoint[] {
  if (points.length <= 1) {
    return points;
  }

  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minLat = Math.min(minLat, point.lat);
    maxLat = Math.max(maxLat, point.lat);
    minLng = Math.min(minLng, point.lng);
    maxLng = Math.max(maxLng, point.lng);
  }

  if (maxLat - minLat > DENSE_CLUSTER_SPAN_THRESHOLD || maxLng - minLng > DENSE_CLUSTER_SPAN_THRESHOLD) {
    return points;
  }

  const sorted = [...points].sort((a, b) => a.photoId - b.photoId);
  const ringSize = 18;
  const densityScale = Math.min(6, Math.max(1.4, Math.sqrt(sorted.length) / 3));

  return sorted.map((point, index) => {
    const ring = Math.floor(index / ringSize) + 1;
    const angle = ((index % ringSize) / ringSize) * Math.PI * 2;
    const radius = ring * 0.000018 * densityScale; // ~2m * density scale
    const latOffset = Math.sin(angle) * radius;
    const lngOffset = (Math.cos(angle) * radius) / Math.max(0.2, Math.cos((point.lat * Math.PI) / 180));
    return {
      ...point,
      lat: clampLat(point.lat + latOffset),
      lng: clampLng(point.lng + lngOffset),
    };
  });
}

export class ClusterService {
  private readonly cache = new ClusterCache<ClusterSnapshot>(2);

  constructor(private readonly photosRepo: PhotosRepository) {}

  invalidate(): void {
    this.cache.clear();
  }

  getClusters(payload: GetClustersPayload): ClusterItem[] {
    const bbox = normalizeBbox(payload.bbox);
    const zoom = Math.max(0, Math.min(22, Math.round(payload.zoom)));
    const snapshot = this.getSnapshot(payload.filters);
    const clusters = snapshot.index.getClusters(bbox, zoom);
    const results: ClusterItem[] = [];

    for (const item of clusters) {
      const [lng, lat] = item.geometry.coordinates;
      const props = item.properties as PointProps | ClusterProps;
      if ('cluster' in props && props.cluster) {
        const pointCount = Number(props.point_count);
        if (zoom >= FORCE_EXPAND_CLUSTER_ZOOM && Number.isFinite(pointCount) && pointCount <= FORCE_EXPAND_CLUSTER_MAX_COUNT) {
          const expanded = this.expandClusterToPoints(snapshot.index, props.cluster_id, pointCount);
          if (expanded.length > 0) {
            results.push(...expanded);
            continue;
          }
        }

        results.push({
          type: 'cluster',
          id: props.cluster_id,
          lat,
          lng,
          count: pointCount,
          representativePhotoId: typeof props.representativePhotoId === 'number' ? props.representativePhotoId : undefined,
          representativeMediaType:
            props.representativeMediaType === 'photo' || props.representativeMediaType === 'video'
              ? props.representativeMediaType
              : undefined,
        });
        continue;
      }

      const photoId = typeof props.photoId === 'number' ? props.photoId : null;
      const mediaType = props.mediaType === 'photo' || props.mediaType === 'video' ? props.mediaType : null;
      if (photoId === null || mediaType === null) {
        continue;
      }

      results.push({
        type: 'point',
        id: photoId,
        photoId,
        lat,
        lng,
        mediaType,
        groupKey: typeof props.groupKey === 'string' ? props.groupKey : undefined,
      });
    }

    return results;
  }

  getPoints(payload: GetPointsPayload): PointItem[] {
    return this.photosRepo.getPointsInBbox(payload.bbox, payload.filters, payload.limit, payload.offset);
  }

  getClusterMembers(payload: GetClusterMembersPayload): Array<{
    type: 'point';
    id: number;
    photoId: number;
    lat: number;
    lng: number;
    mediaType: 'photo' | 'video';
    groupKey?: string;
  }> {
    const snapshot = this.getSnapshot(payload.filters);
    const clusterId = Math.trunc(payload.clusterId);
    const limit = Math.max(1, Math.min(2_000, Math.trunc(payload.limit)));
    let leaves: LeafFeature[] = [];
    try {
      leaves = snapshot.index.getLeaves(clusterId, limit, 0) as LeafFeature[];
    } catch {
      return [];
    }

    return this.extractLeafPoints(leaves)
      .sort((a, b) => a.photoId - b.photoId)
      .slice(0, limit)
      .map((point) => ({
        type: 'point',
        id: point.photoId,
        photoId: point.photoId,
        lat: point.lat,
        lng: point.lng,
        mediaType: point.mediaType,
        groupKey: point.groupKey,
      }));
  }

  private getSnapshot(filters: Filters): ClusterSnapshot {
    const key = this.getFilterKey(filters);
    const cached = this.cache.get(key);
    if (cached) {
      return cached;
    }

    const points = spreadOverlappingPoints(this.photosRepo.getAllGeoPoints(filters));
    const index = new SuperclusterCtor({
      radius: 14,
      maxZoom: 22,
      minZoom: 0,
      nodeSize: 128,
      map: (props: PointProps) => ({
        photoId: props.photoId,
        mediaType: props.mediaType,
        groupKey: props.groupKey,
        representativePhotoId: props.representativePhotoId ?? props.photoId,
        representativeMediaType: props.representativeMediaType ?? props.mediaType,
        representativeName: props.representativeName ?? '',
      }),
      reduce: (accum: PointProps, props: PointProps) => {
        const currentName = accum.representativeName ?? '';
        const nextName = props.representativeName ?? '';
        if (!currentName || (nextName && nextName < currentName)) {
          accum.representativeName = nextName;
          accum.representativePhotoId = props.representativePhotoId ?? props.photoId;
          accum.representativeMediaType = props.representativeMediaType ?? props.mediaType;
        }
      },
    });

    index.load(
      points.map((point) => ({
        type: 'Feature',
        properties: {
          photoId: point.id,
          mediaType: point.mediaType,
          groupKey: point.groupKey,
          representativePhotoId: point.id,
          representativeMediaType: point.mediaType,
          representativeName: point.sortKey,
        },
        geometry: {
          type: 'Point',
          coordinates: [point.lng, point.lat] as [number, number],
        },
      })),
    );

    const created: ClusterSnapshot = { index };
    this.cache.set(key, created);
    return created;
  }

  private expandClusterToPoints(index: any, clusterId: number, pointCount: number): ClusterItem[] {
    let leaves: LeafFeature[] = [];
    try {
      leaves = index.getLeaves(clusterId, Math.max(1, pointCount), 0) as LeafFeature[];
    } catch {
      return [];
    }

    const points = this.extractLeafPoints(leaves);

    return spreadDenseLeafPoints(points).map((point) => ({
      type: 'point',
      id: point.photoId,
      photoId: point.photoId,
      lat: point.lat,
      lng: point.lng,
      mediaType: point.mediaType,
      groupKey: point.groupKey,
    }));
  }

  private extractLeafPoints(leaves: LeafFeature[]): LeafPoint[] {
    const points: LeafPoint[] = [];
    for (const leaf of leaves) {
      const coordinates = leaf.geometry?.coordinates;
      const props = leaf.properties;
      if (!coordinates || coordinates.length < 2 || !props) {
        continue;
      }
      const [lng, lat] = coordinates;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        continue;
      }
      const photoId = typeof props.photoId === 'number' && Number.isInteger(props.photoId) ? props.photoId : null;
      const mediaType = props.mediaType === 'photo' || props.mediaType === 'video' ? props.mediaType : null;
      if (photoId === null || mediaType === null) {
        continue;
      }

      points.push({
        photoId,
        lat,
        lng,
        mediaType,
        groupKey: typeof props.groupKey === 'string' ? props.groupKey : undefined,
      });
    }
    return points;
  }

  private getFilterKey(filters: Filters): string {
    return JSON.stringify({
      dateFromMs: filters.dateFromMs ?? null,
      dateToMs: filters.dateToMs ?? null,
      includeUndated: filters.includeUndated ?? false,
      rootIds: [...(filters.rootIds ?? [])].sort((a, b) => a - b),
      mediaTypes: [...(filters.mediaTypes ?? [])].sort(),
      hasGps: filters.hasGps ?? null,
      cameraModelQuery: filters.cameraModelQuery ?? null,
      minWidthPx: filters.minWidthPx ?? null,
      minHeightPx: filters.minHeightPx ?? null,
      durationFromMs: filters.durationFromMs ?? null,
      durationToMs: filters.durationToMs ?? null,
    });
  }
}
