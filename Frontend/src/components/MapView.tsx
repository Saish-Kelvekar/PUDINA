import { memo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import { useTheme, useThemeColors, themeColors } from '@/lib/theme';
import L from 'leaflet';
import type { EdgeCongestion, RouteResult, Incident } from '@/types';
import { congestionColor, congestionLabel, statusColor, CONGESTION_COLORS } from '@/lib/colors';
import { DEFAULT_CENTER, loadGraph } from '@/api/api';

// Ensure default Leaflet marker icons resolve
const DEFAULT_ICON = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DEFAULT_ICON;

/** Popup HTML is built from strings — escape anything that came from users or data files. */
const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const edgeLatLngs = (e: EdgeCongestion): L.LatLngExpression[] =>
  e.coords && e.coords.length >= 2
    ? (e.coords as L.LatLngExpression[])
    : [[e.from_lat, e.from_lng], [e.to_lat, e.to_lng]];

/**
 * One canvas renderer per map, shared by every vector layer on it. A single canvas is far
 * cheaper to redraw while zooming than thousands of individually-managed paths.
 */
function getRenderer(map: L.Map): L.Canvas {
  const m = map as L.Map & { _tvRenderer?: L.Canvas };
  if (!m._tvRenderer) m._tvRenderer = L.canvas({ padding: 0.5, tolerance: 6 });
  return m._tvRenderer;
}

/**
 * Keeps one LayerGroup per overlay. It only clears and redraws when `signature` changes, so
 * periodic refreshes that return identical data do not rebuild the map.
 */
function useLayerGroup(signature: string, draw: (group: L.LayerGroup, renderer: L.Canvas) => void) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    const group = L.layerGroup().addTo(map);
    layerRef.current = group;
    return () => {
      group.remove();
      layerRef.current = null;
    };
  }, [map]);

  useEffect(() => {
    const group = layerRef.current;
    if (!group) return;
    group.clearLayers();
    drawRef.current(group, getRenderer(map));
  }, [map, signature]);
}

const r2 = (n: number | undefined | null) => (n == null ? 'x' : (Math.round(n * 100) / 100).toString());

/**
 * The whole street network (thin grey) drawn ONCE as a single multi-polyline, plus a dashed
 * outline of the covered area. Also stops the map from panning or zooming far outside it,
 * because there are no roads or traffic data there.
 */
function NetworkLayer() {
  const map = useMap();
  const tc = useThemeColors();
  useEffect(() => {
    let cancelled = false;
    const layers: L.Layer[] = [];
    loadGraph()
      .then((g) => {
        if (cancelled) return;
        const renderer = getRenderer(map);
        const lines = g.edges.filter((e) => e.coords.length >= 2).map((e) => e.coords as L.LatLngExpression[]);
        layers.push(
          L.polyline(lines, { color: tc.networkLine, weight: 1.5, opacity: tc.networkOpacity, interactive: false, renderer }).addTo(map),
          L.rectangle(g.bounds, {
            color: tc.outline,
            weight: 1.5,
            opacity: 0.65,
            dashArray: '6, 8',
            fill: false,
            interactive: false,
            renderer,
          }).addTo(map),
        );
        map.setMaxBounds(g.paddedBounds);
        map.options.maxBoundsViscosity = 1;
        map.setMinZoom(14);
      })
      .catch(() => {
        /* the page shows its own error state if the API is down */
      });
    return () => {
      cancelled = true;
      layers.forEach((l) => l.remove());
    };
  }, [map]);
  return null;
}

/** Monitored roads only (~188): coloured by congestion, popup content built on click. */
function TrafficLayer({ edges }: { edges: EdgeCongestion[] }) {
  const measured = edges.filter((e) => e.congestion >= 0);
  const signature = measured.map((e) => `${e.segment_id ?? e.from}:${r2(e.congestion)}`).join('|');
  useLayerGroup(signature, (group, renderer) => {
    measured.forEach((e) => {
      L.polyline(edgeLatLngs(e), {
        color: congestionColor(e.congestion),
        weight: 5,
        opacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round',
        renderer,
      })
        .bindPopup(
          () =>
            `<strong>${esc(e.street_name ?? `${e.from} → ${e.to}`)}</strong><br/>` +
            `Congestion: ${esc(congestionLabel(e.congestion))}` +
            (e.speed_kmph != null ? ` · ${Math.round(e.speed_kmph)} km/h` : '') +
            `<br/>Free-flow speed: ${esc(e.speed_limit)} km/h<br/>` +
            `Length: ${esc(e.distance_km)} km · ${esc(e.road_type)}<br/>` +
            `<span style="opacity:0.7">${esc(e.segment_id ?? '')} · ${esc(e.source ?? 'SIMULATED')}</span>`,
        )
        .addTo(group);
    });
  });
  return null;
}

function PredictedLayer({ edges }: { edges: Array<EdgeCongestion & { predicted_congestion?: number }> }) {
  const signature = edges.map((e) => `${e.segment_id ?? e.from}:${r2(e.predicted_congestion ?? e.congestion)}`).join('|');
  useLayerGroup(signature, (group, renderer) => {
    edges.forEach((e) => {
      const pred = e.predicted_congestion ?? e.congestion;
      L.polyline(edgeLatLngs(e), {
        color: pred >= 0 ? congestionColor(pred) : CONGESTION_COLORS.purple,
        weight: 6,
        opacity: 0.95,
        dashArray: '2, 9',
        lineCap: 'round',
        lineJoin: 'round',
        renderer,
      })
        .bindPopup(
          () =>
            `<strong>${esc(e.street_name ?? `${e.from} → ${e.to}`)}</strong><br/>` +
            `Predicted: ${esc(congestionLabel(pred))} (${Math.round(Math.max(0, pred) * 100)}%)<br/>` +
            (e.confidence != null ? `Confidence: ${Math.round(e.confidence * 100)}%<br/>` : '') +
            `<span style="opacity:0.7">AI_PREDICTED</span>`,
        )
        .addTo(group);
    });
  });
  return null;
}

function RouteLines({ routes }: { routes: RouteResult[] }) {
  const tc = useThemeColors();
  const signature = routes
    .map((r) => `${r.id ?? r.label}:${r.coords.length}:${r.coords[0]?.lat ?? ''}:${r.recommended ? 1 : 0}:${r.color}`)
    .join('|');
  useLayerGroup(signature, (group, renderer) => {
    // Draw the recommended route last so it sits on top.
    const ordered = [...routes].sort((a, b) => Number(!!a.recommended) - Number(!!b.recommended));
    ordered.forEach((r) => {
      if (r.coords.length < 2) return;
      const latlngs: L.LatLngExpression[] = r.coords.map((c) => [c.lat, c.lng] as [number, number]);
      const isEmergency = r.type === 'emergency' || r.label.toLowerCase().includes('emergency');
      const strong = r.recommended || isEmergency;
      L.polyline(latlngs, {
        color: tc.routeShadow,
        weight: strong ? 12 : 9,
        opacity: tc.routeShadowOpacity,
        lineCap: 'round',
        lineJoin: 'round',
        interactive: false,
        renderer,
      }).addTo(group);
      L.polyline(latlngs, {
        color: r.color,
        weight: strong ? 7 : 5,
        opacity: strong ? 1 : 0.75,
        lineCap: 'round',
        dashArray: isEmergency ? '10, 8' : undefined,
        lineJoin: 'round',
        renderer,
      })
        .bindPopup(
          () =>
            `<strong>${esc(r.label)}</strong><br/>` +
            `Distance: ${esc(r.total_distance_km)} km<br/>` +
            `ETA: ${esc(r.total_time_min)} min` +
            (r.reliability_pct
              ? `<br/>Congestion: ${Math.round(r.avg_congestion * 100)}%<br/>Incidents: ${esc(r.incidents)}<br/>Reliability: ${esc(r.reliability_pct)}%`
              : '') +
            (r.signals_on_route != null ? `<br/>Signals on route: ${esc(r.signals_on_route)}` : ''),
        )
        .addTo(group);
    });
  });
  return null;
}

function IncidentMarkers({ incidents }: { incidents: Incident[] }) {
  const signature = incidents.map((i) => `${i.id}:${i.status}:${i.severity}:${i.lat}:${i.lng}`).join('|');
  useLayerGroup(signature, (group, renderer) => {
    incidents.forEach((inc) => {
      L.circleMarker([inc.lat, inc.lng] as [number, number], {
        radius: inc.is_closure ? 11 : 9,
        color: '#FBF9F6',
        fillColor: statusColor(inc.status),
        fillOpacity: 1,
        weight: 3,
        renderer,
      })
        .bindPopup(
          () =>
            `<strong>${esc(inc.type)}${inc.is_closure ? ' · closure' : ''}</strong><br/>` +
            (inc.description ? `${esc(inc.description)}<br/>` : '') +
            `Severity: ${esc(inc.severity)} · Status: ${esc(inc.status)}<br/>` +
            (inc.nearby_node ? `Near: ${esc(inc.nearby_node)}<br/>` : '') +
            `Reported by: ${esc(inc.reporter)}<br/>` +
            `<span style="opacity:0.7">#${esc(inc.id)} · ${esc(inc.source ?? 'USER_REPORTED')}</span>`,
        )
        .addTo(group);
    });
  });
  return null;
}

export interface MapPin {
  lat: number;
  lng: number;
  label: string;
  color?: string;
  title?: string;
}

function Pins({ pins }: { pins: MapPin[] }) {
  const tc = useThemeColors();
  const signature = pins.map((p) => `${p.lat}:${p.lng}:${p.label}:${p.color ?? ''}:${p.title ?? ''}`).join('|');
  useLayerGroup(signature, (group) => {
    pins.forEach((p) => {
      const icon = L.divIcon({
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        html: `<div style="width:30px;height:30px;border-radius:999px;background:${p.color ?? tc.pinBg};color:${p.color ? '#FFFFFF' : tc.pinFg};display:flex;align-items:center;justify-content:center;font:600 12px Manrope,sans-serif;border:3px solid ${p.color ? '#FFFFFF' : tc.pinBorder};box-shadow:0 6px 16px -6px rgba(0,0,0,.7)">${esc(p.label)}</div>`,
      });
      const m = L.marker([p.lat, p.lng], { icon, keyboard: false });
      if (p.title) m.bindTooltip(esc(p.title), { direction: 'top', offset: [0, -14] });
      m.addTo(group);
    });
  });
  return null;
}

export interface MapLine {
  coords: Array<[number, number]>;
  color: string;
  weight?: number;
  dash?: string;
  title?: string;
}

function ExtraLines({ lines }: { lines: MapLine[] }) {
  const signature = lines.map((l) => `${l.coords.length}:${l.coords[0]?.join(',') ?? ''}:${l.color}:${l.title ?? ''}`).join('|');
  useLayerGroup(signature, (group, renderer) => {
    lines.forEach((l) => {
      if (l.coords.length < 2) return;
      const pl = L.polyline(l.coords as L.LatLngExpression[], {
        color: l.color,
        weight: l.weight ?? 6,
        opacity: 0.95,
        dashArray: l.dash,
        lineCap: 'round',
        lineJoin: 'round',
        renderer,
      });
      if (l.title) {
        const title = l.title;
        pl.bindPopup(() => `<strong>${esc(title)}</strong>`);
      }
      pl.addTo(group);
    });
  });
  return null;
}

/** Re-centres the map when the `center` prop changes after first render. */
function Recenter({ center, zoom }: { center?: [number, number]; zoom?: number }) {
  const map = useMap();
  const first = useRef(true);
  const key = center ? `${center[0].toFixed(5)},${center[1].toFixed(5)},${zoom ?? ''}` : '';
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!center) return;
    // Lift the pan limit while animating so it cannot fight the fly-to; restore it afterwards.
    const limit = map.options.maxBounds;
    if (limit) map.setMaxBounds(null as unknown as L.LatLngBounds);
    map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.6 });
    if (limit) map.once('moveend', () => map.setMaxBounds(limit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function ClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  const ref = useRef(onClick);
  ref.current = onClick;
  useMapEvents({
    click(e) {
      ref.current?.(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

interface MapViewProps {
  edges: EdgeCongestion[];
  incidents: Incident[];
  routes: RouteResult[];
  predictedEdges?: Array<EdgeCongestion & { predicted_congestion?: number }>;
  showPredicted?: boolean;
  center?: [number, number];
  zoom?: number;
  onMapClick?: (lat: number, lng: number) => void;
  pins?: MapPin[];
  lines?: MapLine[];
}

const NO_PINS: MapPin[] = [];
const NO_LINES: MapLine[] = [];

// Tiles: don't fetch new tiles mid-animation (it causes jank); load them once the zoom settles.
const TILE_PERF = { updateWhenZooming: false, updateWhenIdle: true, keepBuffer: 4 } as const;

function MapViewImpl({
  edges,
  incidents,
  routes,
  predictedEdges,
  showPredicted = false,
  center,
  zoom = 15,
  onMapClick,
  pins = NO_PINS,
  lines = NO_LINES,
}: MapViewProps) {
  const { theme } = useTheme();
  const tiles = themeColors(theme).tiles; // 'Dark' or 'Light'
  return (
    <MapContainer
      key={theme} /* redraw everything in the new colours when the theme changes */
      center={center ?? DEFAULT_CENTER}
      zoom={zoom}
      minZoom={14}
      preferCanvas
      style={{ height: '100%', width: '100%', position: 'relative', zIndex: 0, cursor: onMapClick ? 'crosshair' : undefined }}
      zoomControl={false}
      attributionControl
    >
      {/* Esri Gray Canvas (dark at night, light by day): a quiet, key-free basemap so traffic colours stand out. */}
      <TileLayer
        url={`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${tiles}_Gray_Base/MapServer/tile/{z}/{y}/{x}`}
        attribution="Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
        maxNativeZoom={16}
        maxZoom={19}
        {...TILE_PERF}
      />
      <TileLayer
        url={`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${tiles}_Gray_Reference/MapServer/tile/{z}/{y}/{x}`}
        maxNativeZoom={16}
        maxZoom={19}
        className="tv-labels"
        {...TILE_PERF}
      />
      <ZoomControl position="topright" />
      <Recenter center={center} zoom={zoom} />
      <ClickHandler onClick={onMapClick} />
      <NetworkLayer />
      <TrafficLayer edges={edges} />
      {showPredicted && predictedEdges && <PredictedLayer edges={predictedEdges} />}
      <ExtraLines lines={lines} />
      <RouteLines routes={routes} />
      <IncidentMarkers incidents={incidents} />
      <Pins pins={pins} />
    </MapContainer>
  );
}

/** Memoised so parent re-renders (timers, toasts, form typing) don't re-run the map layers. */
export const MapView = memo(MapViewImpl);
