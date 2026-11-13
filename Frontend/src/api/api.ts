import axios, { AxiosInstance, AxiosResponse } from 'axios';
import type {
  EdgeCongestion,
  Incident,
  IncidentCreate,
  RoutesResponse,
  SignalResult,
  Analytics,
  User,
  UserRole,
  CityNode,
  EmergencyVehicle,
  MockConfig,
} from '@/types';

const API_BASE = '/api';

// ---------------------------------------------------------------------------
// Mock configuration — one switch per feature. Flip to `false` when the real
// endpoint goes live. Per PRD Phase 0 / Phase 5 rule.
// ---------------------------------------------------------------------------
export const USE_MOCK: MockConfig = {
  routes: true,
  traffic: true,
  incidents: true,
  predictions: true,
  signals: true,
  emergency: true,
  admin: true,
  analytics: true,
  auth: true, // backend skeleton has no auth endpoints yet
};

const mockDelay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// Axios instance (real API)
// ---------------------------------------------------------------------------
const api: AxiosInstance = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

// Attach JWT when present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('tv_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('tv_token');
      localStorage.removeItem('tv_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

// ---------------------------------------------------------------------------
// Mock data generators (stand-ins shaped exactly like real responses)
// ---------------------------------------------------------------------------

const MOCK_EDGES: EdgeCongestion[] = [
  { from: 'central_hub', to: 'north_gate', from_lat: 12.9716, from_lng: 77.5946, to_lat: 12.983, to_lng: 77.5946, congestion: 0.3, road_type: 'arterial', speed_limit: 60, distance_km: 1.3, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'central_hub', to: 'south_plaza', from_lat: 12.9716, from_lng: 77.5946, to_lat: 12.96, to_lng: 77.5946, congestion: 0.45, road_type: 'arterial', speed_limit: 60, distance_km: 1.3, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'central_hub', to: 'east_terminal', from_lat: 12.9716, from_lng: 77.5946, to_lat: 12.9716, to_lng: 77.608, congestion: 0.2, road_type: 'arterial', speed_limit: 50, distance_km: 1.5, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'central_hub', to: 'west_market', from_lat: 12.9716, from_lng: 77.5946, to_lat: 12.9716, to_lng: 77.581, congestion: 0.6, road_type: 'arterial', speed_limit: 50, distance_km: 1.5, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'central_hub', to: 'hospital_jn', from_lat: 12.9716, from_lng: 77.5946, to_lat: 12.9716, to_lng: 77.602, congestion: 0.25, road_type: 'local', speed_limit: 40, distance_km: 0.8, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'central_hub', to: 'university_av', from_lat: 12.9716, from_lng: 77.5946, to_lat: 12.978, to_lng: 77.587, congestion: 0.5, road_type: 'arterial', speed_limit: 50, distance_km: 0.9, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'central_hub', to: 'inner_ring_south', from_lat: 12.9716, from_lng: 77.5946, to_lat: 12.964, to_lng: 77.594, congestion: 0.35, road_type: 'ring', speed_limit: 60, distance_km: 1.0, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'north_gate', to: 'tech_park', from_lat: 12.983, from_lng: 77.5946, to_lat: 12.985, to_lng: 77.61, congestion: 0.2, road_type: 'highway', speed_limit: 70, distance_km: 1.6, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'north_gate', to: 'airport_rd', from_lat: 12.983, from_lng: 77.5946, to_lat: 12.995, to_lng: 77.5946, congestion: 0.15, road_type: 'highway', speed_limit: 80, distance_km: 1.3, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'north_gate', to: 'university_av', from_lat: 12.983, from_lng: 77.5946, to_lat: 12.978, to_lng: 77.587, congestion: 0.4, road_type: 'arterial', speed_limit: 50, distance_km: 0.7, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'south_plaza', to: 'old_town', from_lat: 12.96, from_lng: 77.5946, to_lat: 12.958, to_lng: 77.578, congestion: 0.3, road_type: 'local', speed_limit: 40, distance_km: 1.4, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'south_plaza', to: 'lake_view', from_lat: 12.96, from_lng: 77.5946, to_lat: 12.967, to_lng: 77.587, congestion: 0.2, road_type: 'local', speed_limit: 40, distance_km: 0.9, source: 'SIMULATED', last_updated: new Date().toISOString() },
  { from: 'silk_board', to: 'electronic_city', from_lat: 12.955, from_lng: 77.622, to_lat: 12.945, to_lng: 77.639, congestion: 0.85, road_type: 'highway', speed_limit: 70, distance_km: 2.8, source: 'SIMULATED', last_updated: new Date().toISOString() },
];

const MOCK_INCIDENTS: Incident[] = [
  {
    id: 101,
    type: 'accident',
    status: 'verified',
    lat: 12.9716,
    lng: 77.5946,
    description: 'Two-vehicle collision near Central Hub',
    severity: 'high',
    reporter: 'user_01',
    affected_edges: [{ from: 'central_hub', to: 'north_gate' }, { from: 'central_hub', to: 'south_plaza' }],
    nearby_node: 'central_hub',
    created_at: new Date(Date.now() - 30 * 60000).toISOString(),
    source: 'USER_REPORTED',
  },
  {
    id: 102,
    type: 'roadblock',
    status: 'pending',
    lat: 12.955,
    lng: 77.622,
    description: 'Roadblock reported at Silk Board junction',
    severity: 'medium',
    reporter: 'user_02',
    affected_edges: [{ from: 'silk_board', to: 'electronic_city' }],
    nearby_node: 'silk_board',
    created_at: new Date(Date.now() - 10 * 60000).toISOString(),
    source: 'USER_REPORTED',
  },
  {
    id: 103,
    type: 'congestion',
    status: 'verified',
    lat: 12.99,
    lng: 77.579,
    description: 'Heavy congestion on Industrial Zone approach',
    severity: 'low',
    reporter: 'user_03',
    affected_edges: [{ from: 'industrial_zone', to: 'airport_rd' }],
    nearby_node: 'industrial_zone',
    created_at: new Date(Date.now() - 60 * 60000).toISOString(),
    source: 'USER_REPORTED',
  },
];

const MOCK_ROUTES: RoutesResponse = {
  shortest: {
    label: 'Shortest',
    color: '#06b6d4',
    path: ['central_hub', 'south_plaza', 'lake_view', 'old_town', 'west_market'],
    coords: [
      { lat: 12.9716, lng: 77.5946 },
      { lat: 12.96, lng: 77.5946 },
      { lat: 12.967, lng: 77.587 },
      { lat: 12.958, lng: 77.578 },
      { lat: 12.9716, lng: 77.581 },
    ],
    total_distance_km: 3.9,
    total_time_min: 12.5,
    avg_congestion: 0.32,
    incidents: 1,
    fuel_liters: 0.31,
    reliability_pct: 78,
    source: 'SIMULATED',
  },
  fastest: {
    label: 'Fastest',
    color: '#a855f7',
    path: ['central_hub', 'north_gate', 'airport_rd', 'industrial_zone'],
    coords: [
      { lat: 12.9716, lng: 77.5946 },
      { lat: 12.983, lng: 77.5946 },
      { lat: 12.995, lng: 77.5946 },
      { lat: 12.99, lng: 77.579 },
    ],
    total_distance_km: 5.1,
    total_time_min: 11.0,
    avg_congestion: 0.18,
    incidents: 0,
    fuel_liters: 0.41,
    reliability_pct: 90,
    source: 'SIMULATED',
  },
  ai_optimized: {
    label: 'AI-Optimized (Recommended)',
    color: '#10b981',
    path: ['central_hub', 'hospital_jn', 'metro_station', 'east_terminal'],
    coords: [
      { lat: 12.9716, lng: 77.5946 },
      { lat: 12.9716, lng: 77.602 },
      { lat: 12.975, lng: 77.602 },
      { lat: 12.9716, lng: 77.608 },
    ],
    total_distance_km: 4.2,
    total_time_min: 13.0,
    avg_congestion: 0.22,
    incidents: 0,
    fuel_liters: 0.34,
    reliability_pct: 88,
    source: 'SIMULATED',
  },
};

type PredictionItem = EdgeCongestion & {
  predicted_congestion: number;
  predicted_level: string;
  confidence: number;
  horizon_min: number;
};

const MOCK_PREDICTIONS: PredictionItem[] = [
  { from: 'central_hub', to: 'north_gate', from_lat: 12.9716, from_lng: 77.5946, to_lat: 12.983, to_lng: 77.5946, current_congestion: 0.3, congestion: 0.3, predicted_congestion: 0.42, predicted_level: 'moderate', confidence: 0.72, horizon_min: 15, source: 'AI_PREDICTED', road_type: 'arterial', speed_limit: 60, distance_km: 1.3 },
  { from: 'central_hub', to: 'south_plaza', from_lat: 12.9716, from_lng: 77.5946, to_lat: 12.96, to_lng: 77.5946, current_congestion: 0.45, congestion: 0.45, predicted_congestion: 0.58, predicted_level: 'moderate', confidence: 0.69, horizon_min: 15, source: 'AI_PREDICTED', road_type: 'arterial', speed_limit: 60, distance_km: 1.3 },
  { from: 'silk_board', to: 'electronic_city', from_lat: 12.955, from_lng: 77.622, to_lat: 12.945, to_lng: 77.639, current_congestion: 0.85, congestion: 0.85, predicted_congestion: 0.92, predicted_level: 'high', confidence: 0.8, horizon_min: 15, source: 'AI_PREDICTED', road_type: 'highway', speed_limit: 70, distance_km: 2.8 },
];

const MOCK_SIGNALS: SignalResult = {
  current_cycle_sec: 90,
  optimized_cycle_sec: 110,
  total_lost_time_sec: 20,
  phases: [
    { approach: 'North', vehicle_density: 35, queue_length: 12, lanes: 2, current_green_sec: 22, optimized_green_sec: 35, yellow_sec: 3, all_red_sec: 2, current_wait_sec: 45, optimized_wait_sec: 28, improvement_pct: 37.8 },
    { approach: 'South', vehicle_density: 28, queue_length: 9, lanes: 2, current_green_sec: 22, optimized_green_sec: 28, yellow_sec: 3, all_red_sec: 2, current_wait_sec: 38, optimized_wait_sec: 32, improvement_pct: 15.8 },
    { approach: 'East', vehicle_density: 42, queue_length: 16, lanes: 2, current_green_sec: 22, optimized_green_sec: 32, yellow_sec: 3, all_red_sec: 2, current_wait_sec: 52, optimized_wait_sec: 35, improvement_pct: 32.7 },
    { approach: 'West', vehicle_density: 20, queue_length: 6, lanes: 2, current_green_sec: 22, optimized_green_sec: 15, yellow_sec: 3, all_red_sec: 2, current_wait_sec: 30, optimized_wait_sec: 22, improvement_pct: 26.7 },
  ],
  summary: {
    avg_wait_before_sec: 41.2,
    avg_wait_after_sec: 29.2,
    total_improvement_pct: 29.1,
    throughput_increase_pct: 12.0,
  },
};

const MOCK_ANALYTICS: Analytics = {
  incidents: { total: 24, pending: 6, verified: 14 },
  routes: { total_calculated: 156 },
  congestion: { high_segments: 4, avg_level: 0.34, total_segments: 18 },
  network: { total_nodes: 19, total_edges: 27 },
  timestamp: new Date().toISOString(),
};

const MOCK_USER: User = { id: 'u_1', name: 'Aryan', email: 'aryan@demo.in', role: 'user' };

// ---------------------------------------------------------------------------
// API client functions — each falls back to mock when its switch is on
// ---------------------------------------------------------------------------

export const apiClient = {
  // ---- Auth (mock until backend provides /api/auth/*) ----
  async login(email: string, _password: string): Promise<{ user: User; token: string }> {
    if (USE_MOCK.auth) {
      await mockDelay();
      const role: UserRole = email.includes('admin') ? 'admin' : email.includes('emergency') ? 'emergency' : 'user';
      const name = role === 'admin' ? 'Admin Demo' : role === 'emergency' ? 'Emergency Ops' : 'Commuter Demo';
      const user: User = { id: `u_${role}`, name, email, role };
      return { user, token: 'mock_token_' + role };
    }
    const res: AxiosResponse = await api.post('/auth/login', { email, password: _password });
    return res.data;
  },
  async register(data: { name: string; email: string; password: string; role?: UserRole }): Promise<{ user: User; token: string }> {
    if (USE_MOCK.auth) {
      await mockDelay();
      return { user: { ...MOCK_USER, ...data, role: data.role ?? 'user' }, token: 'mock_register_token' };
    }
    const res: AxiosResponse = await api.post('/auth/register', data);
    return res.data;
  },
  async me(): Promise<User | null> {
    if (USE_MOCK.auth) {
      const stored = localStorage.getItem('tv_user');
      return stored ? JSON.parse(stored) : null;
    }
    const res: AxiosResponse = await api.get('/auth/me');
    return res.data;
  },

  // ---- Map / graph ----
  async getGraph(): Promise<CityNode[]> {
    const res: AxiosResponse = await api.get('/nodes');
    return res.data;
  },
  async getEdges(): Promise<EdgeCongestion[]> {
    if (USE_MOCK.traffic) {
      await mockDelay();
      return MOCK_EDGES;
    }
    const res: AxiosResponse = await api.get('/graph');
    return res.data;
  },

  // ---- Traffic flow ----
  async getTrafficFlow(): Promise<EdgeCongestion[]> {
    if (USE_MOCK.traffic) {
      await mockDelay();
      return MOCK_EDGES;
    }
    const res: AxiosResponse = await api.get('/congestion');
    return res.data;
  },

  // ---- Routes ----
  async compareRoutes(source: string, destination: string): Promise<RoutesResponse> {
    if (USE_MOCK.routes) {
      await mockDelay();
      return MOCK_ROUTES;
    }
    const res: AxiosResponse = await api.post('/routes', { source, destination });
    return res.data;
  },

  // ---- Incidents ----
  async getIncidents(): Promise<Incident[]> {
    if (USE_MOCK.incidents) {
      await mockDelay();
      return MOCK_INCIDENTS;
    }
    const res: AxiosResponse = await api.get('/incidents');
    return res.data;
  },
  async createIncident(data: IncidentCreate): Promise<Incident> {
    if (USE_MOCK.incidents) {
      await mockDelay();
      const newInc: Incident = {
        id: Math.max(...MOCK_INCIDENTS.map((i) => Number(i.id))) + 1,
        ...data,
        status: 'pending',
        created_at: new Date().toISOString(),
        source: 'USER_REPORTED',
        reporter: data.reporter || 'anonymous',
        nearby_node: 'central_hub',
        affected_edges: [],
      };
      MOCK_INCIDENTS.push(newInc);
      return newInc;
    }
    const res: AxiosResponse = await api.post('/incidents', data);
    return res.data;
  },
  async updateIncidentStatus(id: number | string, status: string): Promise<Incident> {
    if (USE_MOCK.incidents) {
      await mockDelay();
      const inc = MOCK_INCIDENTS.find((i) => i.id === id);
      if (!inc) throw new Error('Incident not found');
      inc.status = status;
      return inc;
    }
    const res: AxiosResponse = await api.patch(`/incidents/${id}`, { status });
    return res.data;
  },
  async deleteIncident(id: number | string): Promise<void> {
    if (USE_MOCK.incidents) {
      await mockDelay();
      const idx = MOCK_INCIDENTS.findIndex((i) => i.id === id);
      if (idx >= 0) MOCK_INCIDENTS.splice(idx, 1);
      return;
    }
    await api.delete(`/incidents/${id}`);
  },

  // ---- Predictions ----
  async getPredictions(horizon = 15): Promise<PredictionItem[]> {
    if (USE_MOCK.predictions) {
      await mockDelay();
      return MOCK_PREDICTIONS.map((p) => ({ ...p, horizon_min: horizon }));
    }
    const res: AxiosResponse = await api.post('/predict', { horizon_min: horizon });
    return res.data.predictions ?? res.data;
  },
  async getPredictionMetrics() {
    if (USE_MOCK.predictions) {
      await mockDelay();
      return { model_version: 'baseline', mae_kmph: 4.2, accuracy_pct: 78, baseline_mae_kmph: 6.1 };
    }
    const res: AxiosResponse = await api.get('/predictions/metrics');
    return res.data;
  },

  // ---- Signals ----
  async optimizeSignals(approaches: Array<{ name: string; vehicle_density: number; queue_length: number; lanes: number }>, currentCycle = 90): Promise<SignalResult> {
    if (USE_MOCK.signals) {
      await mockDelay();
      return MOCK_SIGNALS;
    }
    const res: AxiosResponse = await api.post('/signals/optimize', { approaches, current_cycle: currentCycle });
    return res.data;
  },

  // ---- Emergency ----
  async emergencyRoutes(source: string, destination: string, vehicleType: EmergencyVehicle) {
    if (USE_MOCK.emergency) {
      await mockDelay();
      return {
        normal: MOCK_ROUTES.fastest,
        emergency: { ...MOCK_ROUTES.fastest, label: 'Emergency Priority', total_time_min: 7.5, time_saved_min: 3.5, color: '#f43f5e', source: 'SIMULATION' },
        simulation: true,
      };
    }
    const res: AxiosResponse = await api.post('/emergency/routes', { source, destination, vehicle_type: vehicleType });
    return res.data;
  },

  // ---- Admin ----
  async getAdminOverview() {
    if (USE_MOCK.admin) {
      await mockDelay();
      return { incidents: 24, pending: 6, verified: 14, routes: 156, active_signals: 12 };
    }
    const res: AxiosResponse = await api.get('/admin/overview');
    return res.data;
  },
  async getAdminAnalytics() {
    if (USE_MOCK.analytics) {
      await mockDelay();
      return MOCK_ANALYTICS;
    }
    const res: AxiosResponse = await api.get('/admin/analytics');
    return res.data;
  },
  async getDuplicateCandidates() {
    if (USE_MOCK.admin) {
      await mockDelay();
      return [
        { id: 'd1', incidents: [MOCK_INCIDENTS[0], { ...MOCK_INCIDENTS[0], id: 104 }], score: 0.82 },
      ];
    }
    const res: AxiosResponse = await api.get('/incidents/duplicates');
    return res.data;
  },
  async getNetworkImpact(lat: number, lng: number, radius = 1.5) {
    if (USE_MOCK.admin) {
      await mockDelay();
      return { affected_edges: MOCK_EDGES.slice(0, 4), count: 4, simulated: true };
    }
    const res: AxiosResponse = await api.get('/impact', { params: { lat, lng, radius } });
    return res.data;
  },
};

export default apiClient;
