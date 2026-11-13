import { useThemeColors } from '@/lib/theme';
import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { StatCard } from '@/components/ui/StatCard';
import { SourceBadge, Badge } from '@/components/ui/Badge';
import { PageHeading } from '@/components/layout/PageHeading';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/api/api';
import type { EdgeCongestion, PredictionItem, PredictionMetrics } from '@/types';
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
import { Play, AlertTriangle } from 'lucide-react';
import { istTime } from '@/lib/utils';

export default function Prediction() {
  const tc = useThemeColors();
  const { add } = useToast() as any;
  const [horizon, setHorizon] = useState<15 | 30>(15);
  const [predictions, setPredictions] = useState<PredictionItem[]>([]);
  const [meta, setMeta] = useState<{ model_version: string; fallback_reason: string | null; sim_time_utc: string | null } | null>(null);
  const [metrics, setMetrics] = useState<PredictionMetrics | null>(null);
  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPredictions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [set, flow, m] = await Promise.all([
        apiClient.getPredictions(horizon),
        apiClient.getTrafficFlow(),
        apiClient.getPredictionMetrics().catch(() => null),
      ]);
      setPredictions(set.items);
      setMeta({ model_version: set.model_version, fallback_reason: set.fallback_reason, sim_time_utc: set.sim_time_utc });
      setEdges(flow);
      setMetrics(m);
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

  const highSegments = predictions.filter((p) => p.predicted_congestion > 0.5).length;
  const confs = predictions.map((p) => p.confidence).filter((c): c is number => c != null);
  const avgConf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
  const hm = metrics?.horizons?.[String(horizon)] ?? null;
  const ranked = [...predictions].sort((a, b) => b.predicted_congestion - a.predicted_congestion);

  if (loading && predictions.length === 0) {
    return <LoadingState message="Generating congestion forecast…" />;
  }
  if (error && predictions.length === 0) {
    return <ErrorState title="Unable to load predictions" message={error} onRetry={fetchPredictions} />;
  }

  const pct = (v?: number) => Math.round(Math.max(0, v ?? 0) * 100);
  const chartData = ranked.slice(0, 8).map((p) => ({
    name: (p.street_name ?? p.segment_id ?? '').slice(0, 22),
    current: pct(p.current_congestion),
    predicted: pct(p.predicted_congestion),
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-2xl border border-white bg-sand-50/95 px-3.5 py-2.5 text-xs shadow-glass backdrop-blur">
          <p className="mb-1 font-semibold capitalize text-ink">{label}</p>
          {payload.map((pl: any) => (
            <p key={pl.dataKey} className="flex items-center gap-2 text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: pl.fill }} />
              {pl.dataKey === 'current' ? 'Current' : 'Predicted'}: <strong className="text-ink">{pl.value}%</strong>
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

  const levelVariant = (lvl: string) =>
    lvl === 'severe' ? 'error' : lvl === 'heavy' || lvl === 'moderate' ? 'warning' : lvl === 'flowing' ? 'success' : 'muted';

  return (
    <div className="h-full overflow-y-auto p-3 md:p-5">
      <div className="grid gap-4 lg:h-full lg:grid-cols-[340px_minmax(0,1fr)]">
        {/* Controls */}
        <aside className="space-y-5 rounded-4xl border border-white/80 bg-white/45 p-6 lg:overflow-y-auto">
          <PageHeading
            eyebrow="AI — Forecast — Congestion"
            title="See What's"
            accent="Ahead"
            description="Short-horizon congestion forecasts for every monitored segment."
          />

          <div className="space-y-2">
            <span className="block pl-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">Prediction horizon</span>
            <div className="segmented">
              {([15, 30] as const).map((h) => (
                <button key={h} type="button" data-active={horizon === h} onClick={() => setHorizon(h)}>
                  {h} minutes
                </button>
              ))}
            </div>
          </div>

          <Button onClick={fetchPredictions} variant="primary" size="lg" className="w-full" loading={loading}>
            <Play className="mr-2 h-4 w-4" /> Generate forecast
          </Button>

          <div className="grid grid-cols-2 gap-3">
            <StatCard title="Segments" value={predictions.length} />
            <StatCard title="Heavy or severe" value={highSegments} />
          </div>

          <div className="glass-dark rounded-3xl p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-sand-300">Average confidence</p>
            <p className="mt-2 font-display text-4xl font-light text-sand-50">
              {avgConf != null ? avgConf.toFixed(2) : '—'}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-bronze-light" style={{ width: `${Math.round((avgConf ?? 0) * 100)}%` }} />
            </div>
            <p className="mt-3 text-[11px] text-sand-300">
              {hm
                ? `Test-week error: model ${hm.mae_model_kmph} km/h vs baseline ${hm.mae_baseline_kmph} km/h (${hm.improvement_pct}% better)`
                : 'Model metrics unavailable (ML service offline).'}
            </p>
            <p className="mt-1 text-[11px] text-sand-300">
              Model {meta?.model_version ?? '—'} · forecast from {istTime(meta?.sim_time_utc)} IST
            </p>
          </div>

          {meta?.fallback_reason && (
            <div className="flex gap-2 rounded-2xl border border-traffic-yellow/40 bg-traffic-yellow/10 px-4 py-3 text-xs text-ink-soft">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-traffic-orange" />
              <span>
                <strong>Baseline fallback:</strong> the AI model is unavailable ({meta.fallback_reason}), so predicted speed = current speed.
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-2xl border border-traffic-red/25 bg-traffic-red/10 px-4 py-3 text-sm text-traffic-red">
              {error}
            </div>
          )}
        </aside>

        {/* Results */}
        <div className="grid min-h-0 gap-4 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="flex h-[360px] flex-col rounded-4xl border border-white/80 bg-white/55 p-5 lg:h-auto">
            <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2">
              <div>
                <p className="eyebrow">Actual vs predicted</p>
                <h3 className="display text-2xl">Congestion by segment</h3>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-ink-muted">
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-ink" /> Current</span>
                <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-bronze-light" /> Predicted ({horizon} min)</span>
                <SourceBadge source="AI_PREDICTED" />
              </div>
            </div>
            <div className="min-h-0 w-full flex-1">
              {chartData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-ink-muted">
                  Generate a forecast to view the chart.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, bottom: 10, left: -10 }} barGap={4}>
                    <CartesianGrid strokeDasharray="2 6" stroke={tc.chartGrid} vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: tc.chartTick }} interval={0} angle={-15} textAnchor="end" height={50} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: tc.chartTick }} domain={[0, 100]} axisLine={false} tickLine={false} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: tc.chartCursor, radius: 12 } as any} />
                    <Bar dataKey="current" fill={tc.chartMain} radius={[8, 8, 8, 8]} maxBarSize={18} name="Current %" />
                    <Bar dataKey="predicted" fill={tc.chartAccent} radius={[8, 8, 8, 8]} maxBarSize={18} name="Predicted %" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <div className="grid min-h-0 gap-4 xl:grid-cols-2">
            <section className="flex max-h-[420px] min-h-0 flex-col rounded-4xl border border-white/80 bg-white/55 p-5 lg:max-h-none">
              <div className="mb-3 flex shrink-0 items-center justify-between">
                <h3 className="display text-xl">Segment forecasts</h3>
                <span className="text-[11px] text-ink-faint">{predictions.length} segments</span>
              </div>
              {predictions.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-ink-muted">
                  No forecast data. Generate a forecast.
                </div>
              ) : (
                <div className="-mr-2 min-h-0 flex-1 space-y-2 overflow-y-auto pr-2">
                  {ranked.map((p) => (
                    <div key={p.segment_id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/60 px-3.5 py-2.5">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-ink">{p.street_name ?? p.segment_id}</div>
                        <div className="text-[10px] text-ink-faint">{p.road_type} · {p.distance_km} km</div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <span className="w-8 text-right text-[10px] text-ink-faint">
                          {pct(p.current_congestion)}%
                        </span>
                        <div className="h-1.5 w-14 overflow-hidden rounded-full bg-sand-300/70">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct(p.predicted_congestion)}%`, backgroundColor: congestionColor(p.predicted_congestion) }}
                          />
                        </div>
                        <span className="w-8 text-right text-[11px] font-semibold text-ink">
                          {pct(p.predicted_congestion)}%
                        </span>
                        <Badge variant={levelVariant(p.predicted_level)}>{p.predicted_level}</Badge>
                        <span className="hidden w-8 text-right font-mono text-[10px] text-ink-faint sm:block">{p.confidence != null ? `${Math.round(p.confidence * 100)}%` : '—'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="relative h-[320px] overflow-hidden rounded-4xl border border-white/80 lg:h-auto lg:min-h-[220px]">
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
              <div className="pointer-events-none absolute left-3 top-3 z-10">
                <span className="glass-strong inline-block rounded-full px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
                  Predicted layer
                </span>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
