// TrafficVision AI — shared TypeScript types

export interface CityNode {
  id: string;
  lat: number;
  lng: number;
  name: string;
  type: string;
}

export interface EdgeCongestion {
  from: string;
  to: string;
  from_lat: number;
  from_lng: number;
  to_lat: number;
  to_lng: number;
  congestion: number;
  road_type: string;
  speed_limit: number;
  distance_km: number;
  current_congestion?: number;
  predicted_congestion?: number;
  predicted_level?: string;
  confidence?: number;
  horizon_min?: number;
  source?: string;
  last_updated?: string;
}

export interface RouteResult {
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
}

export interface RoutesResponse {
  shortest?: RouteResult;
  fastest?: RouteResult;
  ai_optimized?: RouteResult;
  emergency?: RouteResult;
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
}

export interface IncidentCreate {
  type: string;
  lat: number;
  lng: number;
  description: string;
  severity: string;
  reporter: string;
}

export interface SignalPhase {
  approach: string;
  vehicle_density: number;
  queue_length: number;
  lanes: number;
  current_green_sec: number;
  optimized_green_sec: number;
  yellow_sec: number;
  all_red_sec: number;
  current_wait_sec: number;
  optimized_wait_sec: number;
  improvement_pct: number;
}

export interface SignalResult {
  current_cycle_sec: number;
  optimized_cycle_sec: number;
  total_lost_time_sec: number;
  phases: SignalPhase[];
  summary: {
    avg_wait_before_sec: number;
    avg_wait_after_sec: number;
    total_improvement_pct: number;
    throughput_increase_pct: number;
  };
}

export interface Analytics {
  incidents: { total: number; pending: number; verified: number };
  routes: { total_calculated: number };
  congestion: { high_segments: number; avg_level: number; total_segments: number };
  network: { total_nodes: number; total_edges: number };
  timestamp: string;
}

export type PanelView =
  | 'route'
  | 'incidents'
  | 'signal'
  | 'emergency'
  | 'admin'
  | 'prediction';

export type IncidentType =
  | 'accident'
  | 'roadblock'
  | 'flood'
  | 'breakdown'
  | 'construction'
  | 'congestion'
  | 'other';

export type EmergencyVehicle = 'ambulance' | 'fire' | 'police';

export type UserRole = 'user' | 'admin' | 'emergency';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export type CongestionLevel = 'green' | 'yellow' | 'orange' | 'red' | 'grey';

export interface MockConfig {
  routes: boolean;
  traffic: boolean;
  incidents: boolean;
  predictions: boolean;
  signals: boolean;
  emergency: boolean;
  admin: boolean;
  analytics: boolean;
  auth: boolean;
}
