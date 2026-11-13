import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { EdgeCongestion, RouteResult, Incident } from '@/types';
import { congestionColor, congestionLabel, statusColor } from '@/lib/colors';

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

function TrafficLayer({ edges }: { edges: EdgeCongestion[] }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!layerRef.current) {
      layerRef.current = L.layerGroup().addTo(map);
    }
    const group = layerRef.current;
    group.clearLayers();

    edges.forEach((e) => {
      const color = congestionColor(e.congestion);
      const latlngs: L.LatLngExpression[] = [
        [e.from_lat, e.from_lng] as [number, number],
        [e.to_lat, e.to_lng] as [number, number],
      ];
      const polyline = L.polyline(latlngs, {
        color,
        weight: 5,
        opacity: 0.85,
        lineJoin: 'round',
      }).bindPopup(
        `<strong>${e.from} → ${e.to}</strong><br/>` +
          `Congestion: ${congestionLabel(e.congestion)}<br/>` +
          `Speed limit: ${e.speed_limit} km/h<br/>` +
          `Distance: ${e.distance_km} km<br/>` +
          `<span style="opacity:0.8">Source: ${e.source ?? 'SIMULATED'}</span>`,
      );
      polyline.addTo(group);
    });

    return () => {
      group.clearLayers();
    };
  }, [edges, map]);

  return null;
}

function PredictedLayer({ edges }: { edges: Array<EdgeCongestion & { predicted_congestion?: number }> }) {
  const map = useMap();
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!layerRef.current) layerRef.current = L.layerGroup().addTo(map);
    const group = layerRef.current;
    group.clearLayers();

    edges.forEach((e) => {
      const pred = e.predicted_congestion ?? e.congestion;
      const latlngs: L.LatLngExpression[] = [
        [e.from_lat, e.from_lng] as [number, number],
        [e.to_lat, e.to_lng] as [number, number],
      ];
      const polyline = L.polyline(latlngs, {
        color: '#7c3aed',
        weight: 5,
        opacity: 0.6,
        dashArray: '6, 8',
        lineJoin: 'round',
      }).bindPopup(
        `<strong>${e.from} → ${e.to}</strong><br/>` +
          `Predicted congestion: ${Math.round((pred ?? 0) * 100)}%<br/>` +
          `<span style="opacity:0.8">Source: AI_PREDICTED</span>`,
      );
      polyline.addTo(group);
    });

    return () => {
      group.clearLayers();
    };
  }, [edges, map]);

  return null;
}

function RouteLines({ routes }: { routes: RouteResult[] }) {
  const layerRef = useRef<L.LayerGroup | null>(null);
  const map = useMap();

  useEffect(() => {
    if (!layerRef.current) layerRef.current = L.layerGroup().addTo(map);
    const group = layerRef.current;
    group.clearLayers();

    routes.forEach((r) => {
      const latlngs: L.LatLngExpression[] = r.coords.map((c) => [c.lat, c.lng] as [number, number]);
      const polyline = L.polyline(latlngs, {
        color: r.color,
        weight: r.label.toLowerCase().includes('emergency') ? 7 : 5,
        opacity: 0.9,
        dashArray: r.label.toLowerCase().includes('emergency') ? '8, 6' : undefined,
        lineJoin: 'round',
      }).bindPopup(
        `<strong>${r.label}</strong><br/>` +
          `Distance: ${r.total_distance_km} km<br/>` +
          `ETA: ${r.total_time_min} min<br/>` +
          `Congestion: ${Math.round(r.avg_congestion * 100)}%<br/>` +
          `Incidents: ${r.incidents}<br/>` +
          `Reliability: ${r.reliability_pct}%`,
      );
      polyline.addTo(group);
    });

    return () => {
      group.clearLayers();
    };
  }, [routes, map]);

  return null;
}

function IncidentMarkers({ incidents }: { incidents: Incident[] }) {
  const layerRef = useRef<L.LayerGroup | null>(null);
  const map = useMap();

  useEffect(() => {
    if (!layerRef.current) layerRef.current = L.layerGroup().addTo(map);
    const group = layerRef.current;
    group.clearLayers();

    incidents.forEach((inc) => {
      const color = statusColor(inc.status);
      const marker = L.circleMarker([inc.lat, inc.lng] as [number, number], {
        radius: 10,
        color,
        fillColor: color,
        fillOpacity: 0.9,
        weight: 2,
      }).bindPopup(
        `<strong>${inc.type}</strong><br/>` +
          `${inc.description}<br/>` +
          `Severity: ${inc.severity}<br/>` +
          `Status: ${inc.status}<br/>` +
          `Reported by: ${inc.reporter}<br/>` +
          `<span style="opacity:0.8">Source: ${inc.source ?? 'USER_REPORTED'}</span>`,
      );
      marker.addTo(group);
    });

    return () => {
      group.clearLayers();
    };
  }, [incidents, map]);

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
}

export function MapView({
  edges,
  incidents,
  routes,
  predictedEdges,
  showPredicted = false,
  center = [12.9716, 77.5946] as [number, number],
  zoom = 13,
  onMapClick,
}: MapViewProps) {
  return (
    <MapContainer
      center={center as [number, number]}
      zoom={zoom}
      style={{ height: '100%', width: '100%', position: 'relative', zIndex: 0 }}
      zoomControl={true}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      <ClickHandler onClick={onMapClick} />
      <TrafficLayer edges={edges} />
      {showPredicted && predictedEdges && <PredictedLayer edges={predictedEdges} />}
      <RouteLines routes={routes} />
      <IncidentMarkers incidents={incidents} />
    </MapContainer>
  );
}
