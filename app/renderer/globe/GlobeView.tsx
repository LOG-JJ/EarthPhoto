import { useEffect, useMemo, useRef } from "react";
import throttle from "lodash.throttle";
import {
  ArcType,
  ArcGisMapServerImageryProvider,
  Cartesian2,
  Cartesian3,
  Color,
  EasingFunction,
  HeightReference,
  HorizontalOrigin,
  Ion,
  IonWorldImageryStyle,
  LabelStyle,
  Math as CesiumMath,
  OpenStreetMapImageryProvider,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  VerticalOrigin,
  Viewer as CesiumViewer,
  createWorldImageryAsync,
  createWorldTerrainAsync,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

import type { ClusterNode, PointNode } from "@shared/types/cluster";
import type { TripSegment } from "@shared/types/ipc";
import { clampLat, clampLng } from "@shared/utils/geo";

import { buildPointData } from "./layers";

export interface GlobeViewState {
  bbox: [number, number, number, number];
  zoom: number;
}

interface GlobeViewProps {
  items: Array<ClusterNode | PointNode>;
  trips?: TripSegment[];
  highlightedTripId?: string | null;
  onClusterClick: (cluster: ClusterNode) => void;
  onPointClick: (point: PointNode) => void;
  onPointHover: (point: PointNode | null) => void;
  onViewChange: (view: GlobeViewState) => void;
  flyToRequest?: {
    lat: number;
    lng: number;
    seq: number;
    targetHeight?: number;
    durationSec?: number;
  } | null;
}

interface PickedEntity {
  id?: {
    id?: string;
  };
}

type PickMeta =
  | {
      type: "cluster";
      data: ClusterNode;
    }
  | {
      type: "point";
      data: PointNode;
    };

const WORLD_VIEW: GlobeViewState = {
  bbox: [-180, -85, 180, 85],
  zoom: 2,
};

const GLOBE_SSE_MOVING = 3.1;
const GLOBE_SSE_IDLE = 1.8;
const GLOBE_LOADING_DESCENDANT_LIMIT = 160;
const GLOBE_MAX_RESOLUTION_SCALE = 1.35;
const TRIP_COLORS = [
  "#f97316",
  "#22c55e",
  "#3b82f6",
  "#ef4444",
  "#14b8a6",
  "#eab308",
  "#ec4899",
  "#a855f7",
];

function spanToZoom(span: number): number {
  const safeSpan = Math.max(0.0001, Math.min(360, span));
  const zoom = Math.log2(360 / safeSpan);
  return Math.max(0, Math.min(22, Math.round(zoom)));
}

function estimateView(viewer: CesiumViewer): GlobeViewState {
  const rectangle = viewer.camera.computeViewRectangle(
    viewer.scene.globe.ellipsoid,
  );
  if (!rectangle) {
    return WORLD_VIEW;
  }

  const west = clampLng(CesiumMath.toDegrees(rectangle.west));
  const south = clampLat(CesiumMath.toDegrees(rectangle.south));
  const east = clampLng(CesiumMath.toDegrees(rectangle.east));
  const north = clampLat(CesiumMath.toDegrees(rectangle.north));

  if (![west, south, east, north].every(Number.isFinite)) {
    return WORLD_VIEW;
  }

  if (east < west) {
    return {
      bbox: [-180, south, 180, north],
      zoom: spanToZoom(360),
    };
  }

  const span = Math.max(0.0001, east - west);
  const zoom = spanToZoom(span);
  return { bbox: [west, south, east, north], zoom };
}

function resolvePickMeta(
  viewer: CesiumViewer,
  position: Cartesian2,
  pickMap: Map<string, PickMeta>,
): PickMeta | null {
  const picks = viewer.scene.drillPick(position, 10) as
    | PickedEntity[]
    | undefined;
  let clusterCandidate: PickMeta | null = null;

  for (const pick of picks ?? []) {
    const id = pick.id?.id;
    if (typeof id !== "string") {
      continue;
    }
    const meta = pickMap.get(id);
    if (!meta) {
      continue;
    }
    if (meta.type === "point") {
      return meta;
    }
    if (!clusterCandidate) {
      clusterCandidate = meta;
    }
  }

  if (clusterCandidate) {
    return clusterCandidate;
  }

  const picked = viewer.scene.pick(position) as PickedEntity | undefined;
  const fallbackId = picked?.id?.id;
  if (typeof fallbackId !== "string") {
    return null;
  }
  return pickMap.get(fallbackId) ?? null;
}

function isTypingElement(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  if (!element) {
    return false;
  }
  const tagName = element.tagName.toLowerCase();
  if (tagName === "input" || tagName === "textarea" || tagName === "select") {
    return true;
  }
  return element.isContentEditable;
}

export function GlobeView({
  items,
  trips = [],
  highlightedTripId = null,
  onClusterClick,
  onPointClick,
  onPointHover,
  onViewChange,
  flyToRequest,
}: GlobeViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumViewer | null>(null);
  const pickHandlerRef = useRef<ScreenSpaceEventHandler | null>(null);
  const pickMetaRef = useRef<Map<string, PickMeta>>(new Map());
  const hoveredPointIdRef = useRef<number | null>(null);
  const onClusterClickRef = useRef(onClusterClick);
  const onPointClickRef = useRef(onPointClick);
  const onPointHoverRef = useRef(onPointHover);
  const onViewChangeRef = useRef(onViewChange);

  const pointData = useMemo(() => buildPointData(items), [items]);

  useEffect(() => {
    onClusterClickRef.current = onClusterClick;
    onPointClickRef.current = onPointClick;
    onPointHoverRef.current = onPointHover;
    onViewChangeRef.current = onViewChange;
  }, [onClusterClick, onPointClick, onPointHover, onViewChange]);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) {
      return;
    }

    const ionToken = (
      import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined
    )?.trim();
    if (ionToken) {
      Ion.defaultAccessToken = ionToken;
    }

    const viewer = new CesiumViewer(containerRef.current, {
      animation: false,
      timeline: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      scene3DOnly: true,
      requestRenderMode: false,
    });
    viewerRef.current = viewer;

    viewer.imageryLayers.removeAll(true);
    viewer.imageryLayers.addImageryProvider(
      new OpenStreetMapImageryProvider({
        url: "https://tile.openstreetmap.org/",
        maximumLevel: 19,
        credit: "OpenStreetMap contributors",
      }),
    );

    const addArcGisLabels = async (): Promise<void> => {
      try {
        const labelsProvider = await ArcGisMapServerImageryProvider.fromUrl(
          "https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer",
        );
        if (viewerRef.current !== viewer || viewer.isDestroyed()) {
          return;
        }
        const labelsLayer =
          viewer.imageryLayers.addImageryProvider(labelsProvider);
        labelsLayer.alpha = 0.92;
      } catch {
        // Keep base imagery only when labels layer is unavailable.
      }
    };

    const baseImageryPromise = ionToken
      ? createWorldImageryAsync({
          style: IonWorldImageryStyle.AERIAL_WITH_LABELS,
        })
      : ArcGisMapServerImageryProvider.fromUrl(
          "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
        );

    void baseImageryPromise
      .then((provider: any) => {
        if (viewerRef.current !== viewer || viewer.isDestroyed()) {
          return;
        }
        viewer.imageryLayers.removeAll(true);
        const baseLayer = viewer.imageryLayers.addImageryProvider(provider);
        baseLayer.brightness = 1.08;
        baseLayer.contrast = 1.08;
        baseLayer.gamma = 0.95;
        if (!ionToken) {
          void addArcGisLabels();
        }
        viewer.scene.requestRender();
      })
      .catch(() => {
        // Keep OSM base layer when ArcGIS imagery is unavailable.
      });

    void createWorldTerrainAsync({
      requestVertexNormals: true,
      requestWaterMask: true,
    })
      .then((terrainProvider) => {
        if (viewerRef.current !== viewer || viewer.isDestroyed()) {
          return;
        }
        viewer.terrainProvider = terrainProvider;
        viewer.scene.requestRender();
      })
      .catch(() => {
        // Keep ellipsoid terrain if world terrain is unavailable.
      });

    viewer.scene.backgroundColor = Color.BLACK;
    viewer.scene.globe.baseColor = Color.BLACK;
    viewer.scene.globe.maximumScreenSpaceError = GLOBE_SSE_IDLE;
    viewer.scene.globe.tileCacheSize = 3_200;
    viewer.scene.globe.loadingDescendantLimit = GLOBE_LOADING_DESCENDANT_LIMIT;
    viewer.scene.globe.preloadAncestors = true;
    viewer.scene.globe.preloadSiblings = true;
    viewer.scene.globe.showGroundAtmosphere = true;
    viewer.scene.globe.showSkirts = true;
    viewer.scene.globe.depthTestAgainstTerrain = false;
    viewer.scene.fog.enabled = false;
    viewer.scene.highDynamicRange = true;
    viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, GLOBE_MAX_RESOLUTION_SCALE);
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1_200;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 45_000_000;
    viewer.camera.setView({
      destination: Cartesian3.fromDegrees(126.978, 37.5665, 5_800_000),
    });

    viewer.camera.percentageChanged = 0.0025;
    const notifyViewThrottled = throttle(
      () => {
        onViewChangeRef.current(estimateView(viewer));
      },
      35,
      { leading: false, trailing: true },
    );

    const cameraChangedListener = () => {
      notifyViewThrottled();
    };

    const moveStartListener = () => {
      // Favor faster low-detail tile convergence while the camera is moving.
      viewer.scene.globe.maximumScreenSpaceError = GLOBE_SSE_MOVING;
    };

    const moveEndListener = () => {
      // Restore detail level once interaction stops.
      viewer.scene.globe.maximumScreenSpaceError = GLOBE_SSE_IDLE;
      notifyViewThrottled.cancel();
      onViewChangeRef.current(estimateView(viewer));
    };

    viewer.camera.moveStart.addEventListener(moveStartListener);
    viewer.camera.changed.addEventListener(cameraChangedListener);
    viewer.camera.moveEnd.addEventListener(moveEndListener);
    onViewChangeRef.current(estimateView(viewer));

    const pickHandler = new ScreenSpaceEventHandler(viewer.scene.canvas);
    pickHandlerRef.current = pickHandler;

    const notifyHover = throttle(
      (point: PointNode | null) => {
        onPointHoverRef.current(point);
      },
      80,
      { leading: true, trailing: true },
    );

    pickHandler.setInputAction((movement: { position: Cartesian2 }) => {
      const pickedMeta = resolvePickMeta(
        viewer,
        movement.position,
        pickMetaRef.current,
      );
      if (!pickedMeta) {
        return;
      }

      if (pickedMeta.type === "cluster") {
        const currentHeight = viewer.camera.positionCartographic.height;
        const minHeight =
          viewer.scene.screenSpaceCameraController.minimumZoomDistance + 300;
        const clusterCount = pickedMeta.data.count;
        if (currentHeight > minHeight * 2) {
          const zoomFactor =
            clusterCount > 1_000 ? 0.32 : clusterCount > 100 ? 0.42 : 0.55;
          const nextHeight = Math.max(minHeight, currentHeight * zoomFactor);
          if (nextHeight < currentHeight * 0.98) {
            viewer.camera.flyTo({
              destination: Cartesian3.fromDegrees(
                pickedMeta.data.lng,
                pickedMeta.data.lat,
                nextHeight,
              ),
              duration: clusterCount > 100 ? 0.48 : 0.7,
              easingFunction: EasingFunction.CUBIC_OUT,
            });
          }
        }
        onClusterClickRef.current(pickedMeta.data);
        return;
      }

      onPointClickRef.current(pickedMeta.data);
    }, ScreenSpaceEventType.LEFT_CLICK);

    pickHandler.setInputAction((movement: { endPosition: Cartesian2 }) => {
      const pickedMeta = resolvePickMeta(
        viewer,
        movement.endPosition,
        pickMetaRef.current,
      );
      if (!pickedMeta || pickedMeta.type !== "point") {
        if (hoveredPointIdRef.current !== null) {
          hoveredPointIdRef.current = null;
          notifyHover(null);
        }
        return;
      }

      if (hoveredPointIdRef.current === pickedMeta.data.photoId) {
        return;
      }

      hoveredPointIdRef.current = pickedMeta.data.photoId;
      notifyHover(pickedMeta.data);
    }, ScreenSpaceEventType.MOUSE_MOVE);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingElement(event.target)) {
        return;
      }

      const moveStep = Math.max(
        0.02,
        Math.min(6, viewer.camera.positionCartographic.height / 5_500_000),
      );
      const headingStep = CesiumMath.toRadians(event.shiftKey ? 5 : 2.4);
      const pitchStep = CesiumMath.toRadians(event.shiftKey ? 3.8 : 1.8);
      let handled = true;

      if (event.key === "ArrowUp") {
        const current = viewer.camera.positionCartographic;
        viewer.camera.setView({
          destination: Cartesian3.fromDegrees(
            CesiumMath.toDegrees(current.longitude),
            clampLat(CesiumMath.toDegrees(current.latitude) + moveStep),
            current.height,
          ),
        });
      } else if (event.key === "ArrowDown") {
        const current = viewer.camera.positionCartographic;
        viewer.camera.setView({
          destination: Cartesian3.fromDegrees(
            CesiumMath.toDegrees(current.longitude),
            clampLat(CesiumMath.toDegrees(current.latitude) - moveStep),
            current.height,
          ),
        });
      } else if (event.key === "ArrowLeft") {
        const current = viewer.camera.positionCartographic;
        viewer.camera.setView({
          destination: Cartesian3.fromDegrees(
            clampLng(CesiumMath.toDegrees(current.longitude) - moveStep),
            CesiumMath.toDegrees(current.latitude),
            current.height,
          ),
        });
      } else if (event.key === "ArrowRight") {
        const current = viewer.camera.positionCartographic;
        viewer.camera.setView({
          destination: Cartesian3.fromDegrees(
            clampLng(CesiumMath.toDegrees(current.longitude) + moveStep),
            CesiumMath.toDegrees(current.latitude),
            current.height,
          ),
        });
      } else if (event.key === "a" || event.key === "A") {
        viewer.camera.setView({
          destination: viewer.camera.position,
          orientation: {
            heading: viewer.camera.heading - headingStep,
            pitch: viewer.camera.pitch,
            roll: viewer.camera.roll,
          },
        });
      } else if (event.key === "d" || event.key === "D") {
        viewer.camera.setView({
          destination: viewer.camera.position,
          orientation: {
            heading: viewer.camera.heading + headingStep,
            pitch: viewer.camera.pitch,
            roll: viewer.camera.roll,
          },
        });
      } else if (event.key === "w" || event.key === "W") {
        viewer.camera.setView({
          destination: viewer.camera.position,
          orientation: {
            heading: viewer.camera.heading,
            pitch: Math.max(
              -CesiumMath.PI_OVER_TWO + 0.03,
              viewer.camera.pitch + pitchStep,
            ),
            roll: viewer.camera.roll,
          },
        });
      } else if (event.key === "s" || event.key === "S") {
        viewer.camera.setView({
          destination: viewer.camera.position,
          orientation: {
            heading: viewer.camera.heading,
            pitch: Math.min(-0.03, viewer.camera.pitch - pitchStep),
            roll: viewer.camera.roll,
          },
        });
      } else {
        handled = false;
      }

      if (handled) {
        event.preventDefault();
        onViewChangeRef.current(estimateView(viewer));
      }
    };
    window.addEventListener("keydown", handleKeyDown, { passive: false });

    return () => {
      notifyHover.cancel();
      notifyViewThrottled.cancel();
      window.removeEventListener("keydown", handleKeyDown);
      viewer.camera.moveStart.removeEventListener(moveStartListener);
      viewer.camera.changed.removeEventListener(cameraChangedListener);
      viewer.camera.moveEnd.removeEventListener(moveEndListener);
      pickHandlerRef.current?.destroy();
      pickHandlerRef.current = null;
      pickMetaRef.current.clear();
      hoveredPointIdRef.current = null;
      onPointHoverRef.current(null);
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!viewerRef.current) {
      return;
    }

    const viewer = viewerRef.current;
    const nextPickMap = new Map<string, PickMeta>();
    viewer.entities.removeAll();

    for (const trip of trips) {
      if (trip.points.length === 0) {
        continue;
      }
      const isHighlighted = highlightedTripId === trip.tripId;
      const color = Color.fromCssColorString(TRIP_COLORS[trip.colorIndex % TRIP_COLORS.length]);
      const firstPoint = trip.points[0];
      const lastPoint = trip.points[trip.points.length - 1];
      const lineId = `trip-line-${trip.tripId}`;
      const startId = `trip-start-${trip.tripId}`;
      const endId = `trip-end-${trip.tripId}`;

      if (trip.points.length >= 2) {
        const positions = trip.points.map((point) => Cartesian3.fromDegrees(point.lng, point.lat, 60));
        viewer.entities.add({
          id: lineId,
          polyline: {
            positions,
            width: isHighlighted ? 4.2 : highlightedTripId ? 2.1 : 2.8,
            material: color.withAlpha(isHighlighted ? 0.95 : highlightedTripId ? 0.36 : 0.78),
            arcType: ArcType.GEODESIC,
            clampToGround: false,
          },
        });
      }

      viewer.entities.add({
        id: startId,
        position: Cartesian3.fromDegrees(firstPoint.lng, firstPoint.lat, 20),
        point: {
          pixelSize: isHighlighted ? 9.5 : 8,
          color: color.withAlpha(isHighlighted ? 1 : highlightedTripId ? 0.58 : 1),
          outlineColor: Color.BLACK.withAlpha(0.9),
          outlineWidth: 2,
          heightReference: HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });

      viewer.entities.add({
        id: endId,
        position: Cartesian3.fromDegrees(lastPoint.lng, lastPoint.lat, 20),
        point: {
          pixelSize: isHighlighted ? 10.5 : 9,
          color: Color.WHITE.withAlpha(isHighlighted ? 0.98 : highlightedTripId ? 0.7 : 0.92),
          outlineColor: color.withAlpha(0.95),
          outlineWidth: 2.4,
          heightReference: HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }

    for (const datum of pointData) {
      const entityId = `${datum.type}-${datum.id}`;
      const isCluster = datum.type === "cluster";
      const pixelSize = Math.max(12, Math.round(datum.size * 62));

      if (isCluster) {
        viewer.entities.add({
          id: entityId,
          position: Cartesian3.fromDegrees(datum.lng, datum.lat, 14),
          point: {
            pixelSize,
            color: Color.fromCssColorString(datum.color),
            outlineColor: Color.BLACK.withAlpha(0.92),
            outlineWidth: 3,
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text: String(datum.count ?? 0),
            fillColor: Color.WHITE,
            showBackground: true,
            backgroundColor: Color.fromCssColorString("#0f1723").withAlpha(0.9),
            backgroundPadding: new Cartesian2(5, 3),
            font: "600 12px Segoe UI",
            style: LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Color.BLACK.withAlpha(0.95),
            outlineWidth: 2,
            horizontalOrigin: HorizontalOrigin.CENTER,
            verticalOrigin: VerticalOrigin.BOTTOM,
            pixelOffset: new Cartesian2(0, -Math.round(pixelSize * 0.85 + 10)),
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      } else {
        viewer.entities.add({
          id: entityId,
          position: Cartesian3.fromDegrees(datum.lng, datum.lat, 8),
          point: {
            pixelSize: 9,
            color: Color.fromCssColorString(datum.color),
            outlineColor: Color.BLACK.withAlpha(0.95),
            outlineWidth: 2,
            heightReference: HeightReference.RELATIVE_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
        });
      }

      if (isCluster) {
        nextPickMap.set(entityId, {
          type: "cluster",
          data: {
            type: "cluster",
            id: datum.id,
            lat: datum.lat,
            lng: datum.lng,
            count: datum.count ?? 0,
            representativePhotoId: datum.representativePhotoId,
            representativeMediaType: datum.representativeMediaType,
          },
        });
        continue;
      }

      if (typeof datum.photoId === "number" && datum.mediaType) {
        nextPickMap.set(entityId, {
          type: "point",
          data: {
            type: "point",
            id: datum.id,
            photoId: datum.photoId,
            lat: datum.lat,
            lng: datum.lng,
            mediaType: datum.mediaType,
            groupKey: datum.groupKey,
          },
        });
      }
    }

    pickMetaRef.current = nextPickMap;
    viewer.scene.requestRender();
  }, [highlightedTripId, pointData, trips]);

  useEffect(() => {
    if (!viewerRef.current || !flyToRequest) {
      return;
    }
    const viewer = viewerRef.current;
    const currentHeight = Math.max(
      viewer.scene.screenSpaceCameraController.minimumZoomDistance + 600,
      viewer.camera.positionCartographic.height,
    );
    const minHeight = viewer.scene.screenSpaceCameraController.minimumZoomDistance + 500;
    const requestedHeight =
      typeof flyToRequest.targetHeight === "number" && Number.isFinite(flyToRequest.targetHeight)
        ? flyToRequest.targetHeight
        : Math.min(currentHeight, 2_800_000);
    const targetHeight = Math.max(
      minHeight,
      Math.min(requestedHeight, 4_200_000),
    );
    viewer.camera.flyTo({
      destination: Cartesian3.fromDegrees(flyToRequest.lng, flyToRequest.lat, targetHeight),
      duration: Math.max(0.35, Math.min(1.8, flyToRequest.durationSec ?? 0.9)),
      easingFunction: EasingFunction.QUADRATIC_IN_OUT,
    });
  }, [flyToRequest]);

  return <div className="globe-canvas" ref={containerRef} />;
}

