import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { StatCard } from '@/components/ui/StatCard';
import { SourceBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/api/api';
import type { EdgeCongestion } from '@/types';
import { LoadingState, ErrorState } from '@/components/ui/ErrorState';
import { congestionColor } from '@/lib/colors';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Brain, Play } from 'lucide-react';

export default function Prediction() {
  const { add } = useToast() as any;
  const [horizon, setHorizon] = useState<15 | 30>(15);
  const [predictions, setPredictions] = useState<Array<EdgeCongestion & { predicted_congestion: number; predicted_level: string; confidence: number }>>([]);
  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [preds] = await Promise.all([apiClient.getPredictions(horizon)]);
      setPredictions(preds as any);
      await apiClient.getTrafficFlow().then(setEdges);
    } catch (err: any) {
      setError(err.message || 'Failed to load predictions');
      add?.('error', 'Prediction load failed', 'Could not fetch congestion forecast');
    } finally {
      setLoading(false);
    }
  }, [horizon, add]);

  useEffect(() => {
    fetchPredictions();
  }, [fetchPredictions]);

  const highSegments = predictions.filter((p) => (p.predicted_congestion ?? 0) > 0.6).length;

  if (loading && predictions.length === 0) {
    return <LoadingState message="Generating congestion forecast…" />;
  }
  if (error && predictions.length === 0) {
    return <ErrorState title="Unable to load predictions" message={error} onRetry={fetchPredictions} />;
  }

  const chartData = predictions.slice(0, 8).map((p) => ({
    name: `${p.from} → ${p.to}`.replace(/_/g, ' '),
    current: Math.round((p.current_congestion ?? p.congestion) * 100),
    predicted: Math.round((p.predicted_congestion ?? 0) * 100),
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const { value } = payload[0];
      return (
        <div className="bg-slate-800 border border-slate-700 p-2 rounded text-xs">
          <strong className="text-slate-100">{value}</strong>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex h-full w-full">
      <aside className="w-80 bg-slate-900/95 backdrop-blur border-r border-slate-800 flex flex-col shrink-0 z-10">
        <div className="p-4 border-b border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-400" /> Traffic Prediction
          </h2>
          <p className="text-xs text-slate-500 mt-1">AI congestion forecast</p>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Prediction horizon</label>
            <div className="flex gap-2">
              {([15, 30] as const).map((h) => (
                <button
                  key={h}
                  onClick={() => setHorizon(h)}
                  className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${
                    horizon === h
                      ? 'bg-purple-600/20 text-purple-300 border-purple-500/30'
                      : 'bg-slate-800 text-slate-400 border-slate-600 hover:text-white hover:border-slate-500'
                  }`}
                >
                  {h}-min
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500">Forecasts {horizon} minutes ahead</p>
          </div>

          <Button onClick={fetchPredictions} variant="primary" className="w-full" loading={loading}>
            <Play className="mr-2 h-4 w-4" /> Generate forecast
          </Button>

          <div className="grid grid-cols-2 gap-3 mt-2">
            <StatCard title="Segments" value={predictions.length} />
            <StatCard title="Severe (>60%)" value={highSegments} trend={{ label: 'segments', value: highSegments, positive: false }} />
          </div>

          <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 mt-3">
            <p className="text-[10px] font-medium text-slate-400 mb-1">Model confidence</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-slate-700 rounded overflow-hidden">
                <div className="h-full bg-blue-500" style={{ width: '72%' }} />
              </div>
              <span className="text-xs text-slate-300 font-mono">0.72</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1">Baseline MAE: 6.1 km/h · Model MAE: 4.2 km/h</p>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-300">
              {error}
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 relative min-w-0 flex flex-col">
        <div className="h-[42%] border-b border-slate-800 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <h3 className="text-sm font-semibold text-slate-100">Actual vs predicted congestion</h3>
            <SourceBadge source="AI_PREDICTED" className="text-[10px]" />
          </div>
          <div className="flex-1 min-h-0 w-full">
            {chartData.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                <p>Generate a forecast to view the chart.</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} angle={-15} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} domain={[0, 100]} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="current" fill="#2563eb" radius={[4, 4, 0, 0]} name="Current %" />
                  <Bar dataKey="predicted" fill="#7c3aed" radius={[4, 4, 0, 0]} name="Predicted %" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="mt-2 flex gap-4 text-[10px] text-slate-500 shrink-0">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-500" /> Current</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-500" /> Predicted ({horizon} min)</span>
          </div>
        </div>

        <div className="flex-1 p-4 overflow-y-auto border-b border-slate-800 min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-100">Segment forecasts</h3>
            <span className="text-xs text-slate-500">{predictions.length} segments</span>
          </div>
          {predictions.length === 0 ? (
            <div className="h-32 flex flex-col items-center justify-center text-center p-6">
              <p className="text-sm text-slate-400">No forecast data. Generate a forecast above.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {predictions.map((p) => (
                <div key={`${p.from}-${p.to}`} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800 border border-slate-700">
                  <div className="min-w-0">
                    <div className="text-sm text-slate-200 truncate max-w-[180px]">{`${p.from} → ${p.to}`.replace(/_/g, ' ')}</div>
                    <div className="text-[10px] text-slate-500">{p.road_type} · {p.distance_km} km</div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-[10px] text-slate-400 w-10 text-right">
                      {Math.round((p.current_congestion ?? p.congestion) * 100)}%
                    </div>
                    <div className="w-16 h-2 bg-slate-700 rounded overflow-hidden">
                      <div
                        className="h-full"
                        style={{ width: `${Math.min((p.predicted_congestion ?? 0) * 100, 100)}%`, backgroundColor: congestionColor(p.predicted_congestion ?? 0) }}
                      />
                    </div>
                    <div className="text-[10px] text-slate-400 w-10 text-right">
                      {Math.round((p.predicted_congestion ?? 0) * 100)}%
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                        p.predicted_level === 'high' ? 'text-red-400 border-red-500/30 bg-red-900/20' :
                        p.predicted_level === 'moderate' ? 'text-yellow-400 border-yellow-500/30 bg-yellow-900/20' :
                        'text-green-400 border-green-500/30 bg-green-900/20'
                      }`}>
                        {p.predicted_level.charAt(0).toUpperCase() + p.predicted_level.slice(1)}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">{Math.round(p.confidence * 100)}%</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="h-[28%] p-3 min-h-[180px]">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Predicted congestion layer</h3>
          <div className="h-[calc(100%-1.5rem)] rounded-lg overflow-hidden border border-slate-800">
            <MapView
              edges={edges}
              incidents={[]}
              routes={[]}
              predictedEdges={predictions.map((p) => ({
                ...p,
                predicted_congestion: p.predicted_congestion,
                predicted_level: p.predicted_level,
              }))}
              showPredicted
            />
          </div>
        </div>
      </div>
    </div>
  );
}
