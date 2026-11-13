// TrafficVision AI — shared TypeScript types
// Frontend-facing shapes. Backend payloads are mapped onto these in src/api/api.ts.

export type LatLng = { lat: number; lng: number };

/** A point accepted by the backend: a graph node id, or a coordinate it snaps to the nearest node. */
export type RoutePoint = { node_id: string } | { lat: number; lng: number };

export interface GraphNode {
  id: string;
  lat: number;
  lng: number;
  name: string;
  signalised: boolean;
  /** Friendly label built from the street names that meet at this node. */
  label: string;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  name: string | null;
  length_m: number;
  road_type: string;
  lanes: number;
  free_flow_kmph: number;
  oneway: boolean;
  coords: Array<[number, number]>;
}

export interface EdgeCongestion {
  from: string;
  to: string;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  /** 0 = free flow … 1 = standstill; negative = no data. */
  congestion: number;
  road_type: string;
  speed_limit: number;
  distance_km: number;
  segment_id?: string;
  street_name?: string;
  speed_kmph?: number | null;
  congestion_level?: string;
  /** Full road geometry as [lat, lng] pairs. */
  coords?: Array<[number, number]>;
  current_congestion?: number;
  predicted_congestion?: number;
  predicted_level?: string;
  confidence?: number | null;
  horizon_min?: number;
  source?: string;
  last_updated?: string;
}

export interface RouteResult {
  id?: string;
  type?: string;
  label: string;
  color: string;
  path: string[];
  coords: Array<{ lat: number; lng: number }>;
  total_distance_km: number;
  total_time_min: number;
  avg_congestion: number;
  incidents: number;
  fuel_liters: number;
  reliability_pct: number;
  time_saved_min?: number;
  source?: string;
  recommended?: boolean;
  explanation?: string;
  same_path_as?: string | null;
  closure_warnings?: string[];
  signals_on_route?: number;
}

export interface RouteComparison {
  /** History id of this search (every compare is saved for the logged-in user). */
  comparison_id?: number;
  /** true when this was opened from the search history instead of calculated now. */
  saved?: boolean;
  created_at?: string;
  chosen_route_id?: string | null;
  routes: RouteResult[];
  recommended_route_id: string | null;
  source: { node_id: string; name: string; lat: number; lng: number; snapped_m: number };
  destination: { node_id: string; name: string; lat: number; lng: number; snapped_m: number };
  sim_time_utc?: string;
}

export interface EmergencySignal {
  node_id: string;
  name: string;
  edge_id: string;
  red_wait_s?: number;
  red_wait_saved_s?: number;
  source?: string;
}

export interface EmergencyResult {
  normal: RouteResult;
  emergency: RouteResult;
  simulation: boolean;
  time_saved_min: number;
  signal_wait_source: string;
  assumptions: string[];
  signals: EmergencySignal[];
  from: { node_id: string; name: string; lat: number; lng: number };
  to: { node_id: string; name: string; lat: number; lng: number };
}

export interface Incident {
  id: number | string;
  type: string;
  status: string;
  lat: number;
  lng: number;
  description: string;
  severity: string;
  reporter: string;
  affected_edges: Array<{ from: string; to: string }>;
  nearby_node: string;
  created_at: string;
  source?: string;
  segment_id?: string | null;
  estimated_severity?: { level: string; confidence: number; evidence: string[] } | null;
  lanes_blocked?: number;
  is_closure?: boolean;
}

export interface IncidentCreate {
  type: string;
  lat: number;
  lng: number;
  description: string;
  severity: string;
  lanes_blocked?: number;
  is_closure?: boolean;
}

export interface DuplicatePair {
  id: string;
  incidents: Incident[];
  score: number;
}

export interface NetworkImpact {
  incident_id: number;
  count: number;
  total_extra_delay_min: number;
  detour_minutes: number | null;
  affected_segments: Array<{
    segment_id: string;
    hops: number;
    speed_before_kmph: number | null;
    speed_after_kmph: number | null;
    extra_delay_s: number | null;
    congestion_level_after: string;
  }>;
  diversion_route: { coords: Array<[number, number]>; distance_km: number; eta_min: number } | null;
}

export interface PredictionItem extends EdgeCongestion {
  predicted_congestion: number;
  predicted_level: string;
  confidence: number | null;
  horizon_min: number;
}

export interface PredictionSet {
  items: PredictionItem[];
  model_version: string;
  fallback_reason: string | null;
  sim_time_utc: string | null;
}

export interface HorizonMetrics {
  mae_model_kmph: number;
  mae_baseline_kmph: number;
  improvement_pct: number;
  level_accuracy_model?: number;
  level_accuracy_baseline?: number;
}

export interface PredictionMetrics {
  model_version: string;
  available: boolean;
  fallback_reason?: string;
  horizons: Record<string, HorizonMetrics | null>;
}

export interface Junction {
  junction_id: string;
  node_id: string;
  name: string;
  label: string;
  lat: number;
  lng: number;
  approaches: Array<{ approach_id: string; edge_id: string; from_node: string; label: string }>;
  current_timing: { cycle_s: number; green_s_each: number; yellow_s: number; all_red_s: number };
}

export interface SignalPlan {
  cycle_s: number;
  phases: Array<{ approach_id: string; green_s: number; yellow_s: number; all_red_s: number }>;
  avg_wait_s: number;
  max_queue: number;
  throughput: number;
}

export interface SignalSimulation {
  simulation_id?: number;
  junction_id: string;
  junction_name?: string;
  mode: 'optimize' | 'emergency';
  cycles: number;
  queues: Array<{ approach_id: string; queue_now: number; arrivals_per_min: number }>;
  current: SignalPlan;
  optimized: SignalPlan;
  improvement: { avg_wait_saved_s: number; avg_wait_change_pct: number; throughput_change_pct: number };
  reasons: Array<{ approach_id: string; text: string }>;
  red_wait_saved_s: number | null;
  as_of_utc?: string;
}

export interface AdminOverview {
  counts: {
    incidents_total: number;
    pending: number;
    verified: number;
    rejected: number;
    merged: number;
    resolved: number;
    active_closures: number;
    duplicate_candidates: number;
    users: number;
    users_by_role?: Record<string, number>;
  };
  recent_actions: Array<{ id: number; incident_id: number; action: string; by: { id: number; name: string } | null; created_at: string }>;
  ml_service: { status: 'up' | 'down'; model_version?: string; reason?: string };
  sim_time_utc: string;
  /** Convenience mirror used by the Admin page. */
  incidents: { total: number; pending: number };
}

export interface Analytics {
  congestion_by_hour: Array<{ hour_ist: number; avg_speed_ratio: number; heavy_or_severe_share: number; samples: number }>;
  incidents_by_type: Array<{ category: string; count: number }>;
  prediction_error: Record<string, { mae_model_kmph: number; mae_baseline_kmph: number; improvement_pct?: number } | null>;
  prediction_model: string | null;
  signal_improvement: Array<{ junction_id: string; name: string; avg_wait_before_s: number; avg_wait_after_s: number; improvement_pct: number | null }>;
  emergency_time_saved: { sessions: number; avg_saved_min: number; total_saved_min: number };
  route_usage?: RouteUsage;
  source_note: string;
  generated_at: string;
}

export interface RouteBrief {
  route_id: string;
  type: string;
  label: string;
  rank: number;
  eta_min: number;
  distance_km: number;
  score: number;
}

export interface HistoryPlace {
  node_id: string;
  /** Friendly label (streets meeting there). */
  name: string;
  lat: number;
  lng: number;
}

export interface RouteHistoryItem {
  id: number;
  created_at: string;
  sim_time_utc: string | null;
  source: HistoryPlace;
  destination: HistoryPlace;
  route_count: number;
  recommended: RouteBrief | null;
  chosen: (RouteBrief & { chosen_at: string | null; followed_recommendation: boolean }) | null;
}

export interface RouteHistoryPage {
  total: number;
  limit: number;
  offset: number;
  items: RouteHistoryItem[];
}

export interface RouteUsage {
  searches: number;
  chosen: number;
  followed_recommendation: number;
  followed_pct: number | null;
  chosen_by_type: Array<{ type: string; count: number }>;
  top_trips: Array<{ source: { node_id: string; name: string }; destination: { node_id: string; name: string }; searches: number; chosen: number }>;
}

export interface SimClock {
  sim_time_utc: string;
  step_minutes: number;
  data_from_utc: string | null;
  data_until_utc: string | null;
}

export type IncidentType =
  | 'accident'
  | 'breakdown'
  | 'roadwork'
  | 'flooding'
  | 'closure'
  | 'event'
  | 'other';

export type EmergencyVehicle = 'ambulance' | 'fire' | 'police';

export type UserRole = 'user' | 'admin' | 'emergency';

export interface User {
  id: string | number;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}
