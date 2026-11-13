import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { Legend, IncidentLegend } from '@/components/Legend';
import { StatCard } from '@/components/ui/StatCard';
import { SourceBadge } from '@/components/ui/Badge';
import { LoadingState, ErrorState } from '@/components/ui/ErrorState';
import { apiClient } from '@/api/api';
import type { EdgeCongestion, Incident, RouteResult } from '@/types';
import { isoToLocalTime } from '@/lib/colors';
import { Layers, RefreshCw } from 'lucide-react';

export default function MapPage() {
  const { add } = useToast() as any;
  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [routes] = useState<RouteResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPredicted, setShowPredicted] = useState(false);
  const [predicted, setPredicted] = useState<Array<EdgeCongestion & { predicted_congestion?: number }>>([]);

  const fetchMapData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [trafficRes, incidentsRes, predRes] = await Promise.all([
        apiClient.getTrafficFlow(),
        apiClient.getIncidents(),
        apiClient.getPredictions(15).catch(() => []),
      ]);
      setEdges(trafficRes);
      setIncidents(incidentsRes);
      setPredicted(predRes as any);
    } catch (err: any) {
      setError(err.message || 'Failed to load map data');
      add?.('error', 'Map load failed', 'Unable to load traffic and incident data');
    } finally {
      setLoading(false);
    }
  }, [add]);

  useEffect(() => {
    fetchMapData();
    const id = setInterval(fetchMapData, 30000);
    return () => clearInterval(id);
  }, [fetchMapData]);

  const handleRetry = () => fetchMapData();

  if (loading && edges.length === 0 && !error) {
    return <LoadingState message="Loading traffic map…" />;
  }
  if (error && edges.length === 0) {
    return <ErrorState title="Unable to load map" message={error} onRetry={handleRetry} />;
  }

  const congestedCount = edges.filter((e) => e.congestion > 0.6).length;
  const verifiedCount = incidents.filter((i) => i.status === 'verified').length;

  return (
    <div className="flex h-full w-full">
      <div className="flex-1 relative min-w-0">
        <MapView
          edges={edges}
          incidents={incidents}
          routes={routes}
          predictedEdges={predicted}
          showPredicted={showPredicted}
        />

        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <button
              onClick={fetchMapData}
              className="p-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
              title="Refresh data"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
            <button
              onClick={() => setShowPredicted((v) => !v)}
              className={`p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors ${
                showPredicted ? 'bg-blue-600/20 text-blue-300 border border-blue-500/30' : 'bg-slate-800 border border-slate-600'
              }`}
              title={showPredicted ? 'Hide predicted congestion' : 'Show predicted congestion (AI)'}
            >
              <Layers className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-slate-900/80 backdrop-blur border border-slate-700 rounded-lg px-3 py-1.5 shadow-panel">
          <SourceBadge source="SIMULATED" className="text-[10px]" />
          <span className="text-xs text-slate-400">Last updated {isoToLocalTime(new Date().toISOString())}</span>
        </div>
      </div>

      <aside className="w-72 bg-slate-900/95 backdrop-blur border-l border-slate-800 flex flex-col shrink-0 z-10">
        <div className="p-4 border-b border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-100">Network status</h2>
          <p className="text-xs text-slate-500 mt-1">All data labelled SIMULATED</p>
        </div>

        <div className="p-4 space-y-3 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <StatCard title="Segments monitored" value={edges.length} />
            <StatCard title="Severe congestion" value={congestedCount} trend={{ label: 'segments', value: congestedCount, positive: false }} />
            <StatCard title="Active incidents" value={incidents.length} trend={{ label: 'verified', value: verifiedCount, positive: false }} />
            <StatCard title="Routes available" value={routes.length} />
          </div>

          <Legend showPredicted={showPredicted} />
          <IncidentLegend />

          <div className="mt-4 p-3 rounded-lg bg-slate-800 border border-slate-700">
            <p className="text-xs text-slate-400 mb-2">How to use</p>
            <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside">
              <li>Coloured lines show live congestion by road segment.</li>
              <li>Red markers are reported incidents.</li>
              <li>Toggle the predicted layer for AI forecasts.</li>
              <li>Open Route Planner to compare journeys.</li>
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}
