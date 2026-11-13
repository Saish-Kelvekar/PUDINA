import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, ZoomControl, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { EdgeCongestion, RouteResult, Incident } from '@/types';
import { congestionColor, congestionLabel, statusColor, CONGESTION_COLORS } from '@/lib/colors';
import { DEFAULT_CENTER } from '@/api/api';

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

/** Keeps one LayerGroup per overlay and redraws it when `deps` change. */
function useLayerGroup(draw: (group: L.LayerGroup, map: L.Map) => void, deps: unknown[]) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);
  useEffect(() => {
    if (!layerRef.current) layerRef.current = L.layerGroup().addTo(map);
    const group = layerRef.current;
    group.clearLayers();
    draw(group, map);
    return () => {
      group.clearLayers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);
}

function TrafficLayer({ edges }: { edges: EdgeCongestion[] }) {
  useLayerGroup((group) => {
    // Only the monitored main roads carry traffic data; the rest of the street network is drawn
    // as a faint, non-interactive base layer underneath.
    const measured = edges.filter((e) => e.congestion >= 0);
    edges.forEach((e) => {
      if (e.congestion >= 0) return;
      L.polyline(edgeLatLngs(e), { color: '#8A8178', weight: 1.5, opacity: 0.35, interactive: false }).addTo(group);
    });
    const casing = measured.length <= 800;
    measured.forEach((e) => {
      const latlngs = edgeLatLngs(e);
      const color = congestionColor(e.congestion);
      if (casing) {
        L.polyline(latlngs, { color: '#FBF9F6', weight: 9, opacity: 0.9, lineCap: 'round', interactive: false }).addTo(group);
      }
      L.polyline(latlngs, {
        color,
        weight: 5,
        opacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round',
      })
        .bindPopup(
          `<strong>${esc(e.street_name ?? `${e.from} → ${e.to}`)}</strong><br/>` +
            `Congestion: ${esc(congestionLabel(e.congestion))}` +
            (e.speed_kmph != null ? ` · ${Math.round(e.speed_kmph)} km/h` : '') +
            `<br/>Free-flow speed: ${esc(e.speed_limit)} km/h<br/>` +
            `Length: ${esc(e.distance_km)} km · ${esc(e.road_type)}<br/>` +
            `<span style="opacity:0.7">${esc(e.segment_id ?? '')} · ${esc(e.source ?? 'SIMULATED')}</span>`,
        )
        .addTo(group);
    });
  }, [edges]);
  return null;
}

function PredictedLayer({ edges }: { edges: Array<EdgeCongestion & { predicted_congestion?: number }> }) {
  useLayerGroup((group) => {
    edges.forEach((e) => {
      const pred = e.predicted_congestion ?? e.congestion;
      L.polyline(edgeLatLngs(e), {
        color: pred >= 0 ? congestionColor(pred) : CONGESTION_COLORS.purple,
        weight: 6,
        opacity: 0.95,
        dashArray: '2, 9',
        lineCap: 'round',
        lineJoin: 'round',
      })
        .bindPopup(
          `<strong>${esc(e.street_name ?? `${e.from} → ${e.to}`)}</strong><br/>` +
            `Predicted: ${esc(congestionLabel(pred))} (${Math.round(Math.max(0, pred) * 100)}%)<br/>` +
            (e.confidence != null ? `Confidence: ${Math.round(e.confidence * 100)}%<br/>` : '') +
            `<span style="opacity:0.7">AI_PREDICTED</span>`,
        )
        .addTo(group);
    });
  }, [edges]);
  return null;
}

function RouteLines({ routes }: { routes: RouteResult[] }) {
  useLayerGroup((group) => {
    // Draw the recommended route last so it sits on top.
    const ordered = [...routes].sort((a, b) => Number(!!a.recommended) - Number(!!b.recommended));
    ordered.forEach((r) => {
      if (r.coords.length < 2) return;
      const latlngs: L.LatLngExpression[] = r.coords.map((c) => [c.lat, c.lng] as [number, number]);
      const isEmergency = r.type === 'emergency' || r.label.toLowerCase().includes('emergency');
      const strong = r.recommended || isEmergency;
      L.polyline(latlngs, { color: '#1F1D1B', weight: strong ? 12 : 9, opacity: 0.16, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(group);
      L.polyline(latlngs, {
        color: r.color,
        weight: strong ? 7 : 5,
        opacity: strong ? 1 : 0.75,
        lineCap: 'round',
        dashArray: isEmergency ? '10, 8' : undefined,
        lineJoin: 'round',
      })
        .bindPopup(
          `<strong>${esc(r.label)}</strong><br/>` +
            `Distance: ${esc(r.total_distance_km)} km<br/>` +
            `ETA: ${esc(r.total_time_min)} min` +
            (r.reliability_pct ? `<br/>Congestion: ${Math.round(r.avg_congestion * 100)}%<br/>Incidents: ${esc(r.incidents)}<br/>Reliability: ${esc(r.reliability_pct)}%` : '') +
            (r.signals_on_route != null ? `<br/>Signals on route: ${esc(r.signals_on_route)}` : ''),
        )
        .addTo(group);
    });
  }, [routes]);
  return null;
}

function IncidentMarkers({ incidents }: { incidents: Incident[] }) {
  useLayerGroup((group) => {
    incidents.forEach((inc) => {
      const color = statusColor(inc.status);
      L.circleMarker([inc.lat, inc.lng] as [number, number], {
        radius: inc.is_closure ? 11 : 9,
        color: '#FBF9F6',
        fillColor: color,
        fillOpacity: 1,
        weight: 3,
      })
        .bindPopup(
          `<strong>${esc(inc.type)}${inc.is_closure ? ' · closure' : ''}</strong><br/>` +
            (inc.description ? `${esc(inc.description)}<br/>` : '') +
            `Severity: ${esc(inc.severity)} · Status: ${esc(inc.status)}<br/>` +
            (inc.nearby_node ? `Near: ${esc(inc.nearby_node)}<br/>` : '') +
            `Reported by: ${esc(inc.reporter)}<br/>` +
            `<span style="opacity:0.7">#${esc(inc.id)} · ${esc(inc.source ?? 'USER_REPORTED')}</span>`,
        )
        .addTo(group);
    });
  }, [incidents]);
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
  useLayerGroup((group) => {
    pins.forEach((p) => {
      const icon = L.divIcon({
        className: '',
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        html: `<div style="width:30px;height:30px;border-radius:999px;background:${p.color ?? '#1F1D1B'};color:#FBF9F6;display:flex;align-items:center;justify-content:center;font:600 12px Manrope,sans-serif;border:3px solid #FBF9F6;box-shadow:0 6px 16px -6px rgba(31,29,27,.6)">${esc(p.label)}</div>`,
      });
      const m = L.marker([p.lat, p.lng], { icon, keyboard: false });
      if (p.title) m.bindTooltip(esc(p.title), { direction: 'top', offset: [0, -14] });
      m.addTo(group);
    });
  }, [pins]);
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
  useLayerGroup((group) => {
    lines.forEach((l) => {
      if (l.coords.length < 2) return;
      const pl = L.polyline(l.coords as L.LatLngExpression[], {
        color: l.color,
        weight: l.weight ?? 6,
        opacity: 0.95,
        dashArray: l.dash,
        lineCap: 'round',
        lineJoin: 'round',
      });
      if (l.title) pl.bindPopup(`<strong>${esc(l.title)}</strong>`);
      pl.addTo(group);
    });
  }, [lines]);
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
    if (center) map.flyTo(center, zoom ?? map.getZoom(), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

function ClickHandler({ onClick }: { onClick?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onClick?.(e.latlng.lat, e.latlng.lng);
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

export function MapView({
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
  return (
    <MapContainer
      center={center ?? DEFAULT_CENTER}
      zoom={zoom}
      preferCanvas
      style={{ height: '100%', width: '100%', position: 'relative', zIndex: 0, cursor: onMapClick ? 'crosshair' : undefined }}
      zoomControl={false}
      attributionControl
    >
      {/* Esri Light Gray Canvas: a quiet, key-free basemap so traffic colours stand out. */}
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        attribution="Tiles &copy; Esri &mdash; Esri, HERE, Garmin, &copy; OpenStreetMap contributors"
        maxNativeZoom={16}
        maxZoom={19}
      />
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
        maxNativeZoom={16}
        maxZoom={19}
        className="tv-labels"
      />
      <ZoomControl position="topright" />
      <Recenter center={center} zoom={zoom} />
      <ClickHandler onClick={onMapClick} />
      <TrafficLayer edges={edges} />
      {showPredicted && predictedEdges && <PredictedLayer edges={predictedEdges} />}
      <ExtraLines lines={lines} />
      <RouteLines routes={routes} />
      <IncidentMarkers incidents={incidents} />
      <Pins pins={pins} />
    </MapContainer>
  );
}
