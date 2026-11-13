import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { apiClient } from '@/api/api';
import type { EdgeCongestion, RouteResult } from '@/types';
import { formatETA, congestionColor, congestionLabel } from '@/lib/colors';
import { Route, Sparkles, TrendingUp, ArrowLeft, ArrowRight } from '@/icons';

const NODES: { id: string; name: string }[] = [
  { id: 'central_hub', name: 'Central Hub' },
  { id: 'north_gate', name: 'North Gate' },
  { id: 'south_plaza', name: 'South Plaza' },
  { id: 'east_terminal', name: 'East Terminal' },
  { id: 'west_market', name: 'West Market' },
  { id: 'tech_park', name: 'Tech Park' },
  { id: 'old_town', name: 'Old Town' },
  { id: 'airport_rd', name: 'Airport Road' },
  { id: 'hospital_jn', name: 'Hospital Jn' },
  { id: 'university_av', name: 'University Ave' },
  { id: 'stadium_rd', name: 'Stadium Road' },
  { id: 'lake_view', name: 'Lake View' },
  { id: 'industrial_zone', name: 'Industrial Zone' },
  { id: 'inner_ring_north', name: 'Inner Ring N' },
  { id: 'inner_ring_south', name: 'Inner Ring S' },
  { id: 'metro_station', name: 'Metro Station' },
  { id: 'silk_board', name: 'Silk Board' },
  { id: 'electronic_city', name: 'Electronic City' },
];

export default function RoutePlanner() {
  const { add } = useToast() as any;
  const [source, setSource] = useState('central_hub');
  const [destination, setDestination] = useState('electronic_city');
  const [routes, setRoutes] = useState<RouteResult[]>([]);
  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recommended, setRecommended] = useState<RouteResult | null>(null);

  useEffect(() => {
    apiClient.getTrafficFlow().then(setEdges).catch(() => {});
  }, []);

  const fetchRoutes = useCallback(async () => {
    if (!source || !destination || source === destination) {
      setError('Please select different source and destination');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.compareRoutes(source, destination);
      const list = Object.values(data).filter(Boolean) as RouteResult[];
      setRoutes(list);
      setRecommended(list.find((r) => r.label.toLowerCase().includes('ai')) || list[0]);
      await apiClient.getTrafficFlow().then(setEdges);
    } catch (err: any) {
      setError(err.message || 'Failed to calculate routes');
      add?.('error', 'Route calculation failed', 'Could not compute routes');
    } finally {
      setLoading(false);
    }
  }, [source, destination, add]);

  const handleSwap = () => {
    setSource(destination);
    setDestination(source);
  };

  const handleRecommend = (r: RouteResult) => setRecommended(r);

  if (loading && routes.length === 0) {
    return <div className="flex h-full items-center justify-center"><p className="text-slate-400">Calculating routes…</p></div>;
  }
  if (error && routes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <button onClick={fetchRoutes} className="text-blue-400 underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full">
      <aside className="w-80 bg-slate-900/95 backdrop-blur border-r border-slate-800 flex flex-col shrink-0 z-10">
        <div className="p-4 border-b border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Route className="h-5 w-5 text-blue-400" /> Route Planner
          </h2>
          <p className="text-xs text-slate-500 mt-1">Compare routes between junctions</p>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Source</label>
            <Select value={source} onChange={(e) => setSource(e.target.value)} className="bg-slate-800 border-slate-600">
              {NODES.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-center">
            <button
              onClick={handleSwap}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors"
              title="Swap source and destination"
              aria-label="Swap source and destination"
            >
              <span className="flex items-center gap-1 text-xs font-medium"><ArrowLeft className="h-3.5 w-3.5" /><ArrowRight className="h-3.5 w-3.5" /></span>
            </button>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Destination</label>
            <Select value={destination} onChange={(e) => setDestination(e.target.value)} className="bg-slate-800 border-slate-600">
              {NODES.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </Select>
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
            <p className="text-xs font-medium text-slate-300 mb-3">Route weighting</p>
            <div className="space-y-2">
              {['time', 'congestion', 'distance'].map((key) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-xs text-slate-300">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                  <span className="text-xs text-slate-500 w-8 text-right">33%</span>
                </div>
              ))}
              <p className="text-[10px] text-slate-500 mt-1">Weights normalise to 100% before scoring.</p>
            </div>
          </div>

          <Button onClick={fetchRoutes} variant="primary" className="w-full" loading={loading}>
            <Sparkles className="mr-2 h-4 w-4" /> Calculate routes
          </Button>

          {error && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 relative min-w-0 flex flex-col">
        <MapView edges={edges} incidents={[]} routes={routes} />

        <div className="h-1/3 bg-slate-900 border-t border-slate-800 flex flex-col shrink-0 overflow-hidden">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-400" /> Route options
            </h3>
            <span className="text-xs text-slate-500">{routes.length} routes calculated</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {routes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <p className="text-sm text-slate-400">Select source &amp; destination, then calculate.</p>
              </div>
            ) : (
              routes.map((r) => {
                const isRec = recommended?.label === r.label;
                return (
                  <div
                    key={r.label}
                    onClick={() => handleRecommend(r)}
                    className={`cursor-pointer rounded-lg p-3 border transition-all ${
                      isRec
                        ? 'bg-blue-600/10 border-blue-500/30 shadow-[0_0_0_1px_rgba(37,99,235,0.2)]'
                        : 'bg-slate-800 border-slate-700 hover:border-slate-600 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.color }} />
                        <span className={`font-semibold text-slate-200 ${isRec ? 'text-blue-300' : ''}`}>
                          {r.label}
                        </span>
                        {isRec && (
                          <span className="text-[10px] bg-blue-600/20 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/30">
                            Recommended
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-mono text-slate-400">{formatETA(r.total_time_min)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="bg-slate-800/50 rounded p-1.5">
                        <div className="text-[10px] text-slate-500">Distance</div>
                        <div className="text-slate-300">{r.total_distance_km} km</div>
                      </div>
                      <div className="bg-slate-800/50 rounded p-1.5">
                        <div className="text-[10px] text-slate-500">Congestion</div>
                        <div className="text-slate-300" style={{ color: congestionColor(r.avg_congestion) }}>
                          {congestionLabel(r.avg_congestion)}
                        </div>
                      </div>
                      <div className="bg-slate-800/50 rounded p-1.5">
                        <div className="text-[10px] text-slate-500">Reliability</div>
                        <div className="text-slate-300">{r.reliability_pct}%</div>
                      </div>
                    </div>
                    <div className="mt-2 flex gap-2 text-[10px]">
                      <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">Incidents: {r.incidents}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">Fuel: {r.fuel_liters} L</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-700 text-slate-300">Source: {r.source ?? 'SIMULATED'}</span>
                    </div>
                    {r.time_saved_min !== undefined && (
                      <div className="mt-2 p-2 rounded bg-green-900/20 border border-green-500/30 text-xs text-green-300">
                        Time saved vs fastest: {formatETA(r.time_saved_min)}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
