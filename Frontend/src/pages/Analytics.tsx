import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { StatCard, StatStrip } from '@/components/ui/StatCard';
import { PageHeading } from '@/components/layout/PageHeading';
import { apiClient, loadGraph } from '@/api/api';
import type { AdminOverview, Analytics as AnalyticsData } from '@/types';
import { LoadingState, ErrorState } from '@/components/ui/ErrorState';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { Activity, Clock, TrendingUp, AlertTriangle, Hourglass, CheckCircle2, Ambulance, Route as RouteIcon } from 'lucide-react';
import { routeColor } from '@/lib/utils';

const COLORS = ['#E9E4DE', '#E3A034', '#2A8E7E', '#F0BE6A', '#9D88C2', '#6A8FB8', '#5FBFAE'];

export default function Analytics() {
  const { add } = useToast() as any;
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [network, setNetwork] = useState<{ nodes: number; edges: number; signals: number } | null>(null);
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const tripLabel = (id: string, fallback: string) => labels.get(id) ?? fallback;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [a, ov, g] = await Promise.all([
        apiClient.getAdminAnalytics(),
        apiClient.getAdminOverview(),
        loadGraph().catch(() => null),
      ]);
      setAnalytics(a);
      setOverview(ov);
      if (g) setNetwork({ nodes: g.nodes.length, edges: g.edges.length, signals: g.nodes.filter((n) => n.signalised).length });
      if (g) setLabels(new Map(g.nodes.map((n) => [n.id, n.label])));
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics');
      add?.('error', 'Analytics load failed', err.message);
    } finally {
      setLoading(false);
    }
  }, [add]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  if (loading && !analytics) {
    return <LoadingState message="Loading analytics…" />;
  }
  if (error && !analytics) {
    return <ErrorState title="Analytics load failed" message={error} onRetry={fetchAnalytics} />;
  }

  const a = analytics!;
  const c = overview?.counts;

  const hourly = a.congestion_by_hour.map((h) => ({
    hour: String(h.hour_ist).padStart(2, '0'),
    value: Math.round(h.heavy_or_severe_share * 100),
  }));
  const peakRow = hourly.reduce<{ hour: string; value: number } | null>((best, h) => (!best || h.value > best.value ? h : best), null);
  const peak = peakRow?.value ?? 0;

  const incidentTypes = a.incidents_by_type.map((t) => ({
    name: t.category.charAt(0).toUpperCase() + t.category.slice(1),
    value: t.count,
  }));
  const incidentTotal = incidentTypes.reduce((s, t) => s + t.value, 0);

  const pe15 = a.prediction_error?.['15'] ?? null;
  const pe30 = a.prediction_error?.['30'] ?? null;
  const maxMae = Math.max(1, pe15?.mae_baseline_kmph ?? 0, pe30?.mae_baseline_kmph ?? 0, pe15?.mae_model_kmph ?? 0, pe30?.mae_model_kmph ?? 0);

  const sig = a.signal_improvement;
  const sigWithPct = sig.filter((s) => s.improvement_pct != null);
  const avgSigPct = sigWithPct.length
    ? Math.round((sigWithPct.reduce((s, x) => s + (x.improvement_pct ?? 0), 0) / sigWithPct.length) * 10) / 10
    : null;

  const ChartTooltip = ({ active, payload, label }: any) =>
    active && payload?.length ? (
      <div className="rounded-2xl border border-white bg-sand-50/95 px-3.5 py-2 text-xs shadow-glass backdrop-blur">
        <p className="text-ink-muted">{label !== undefined ? `${label}:00 IST` : payload[0].name}</p>
        <p className="font-semibold text-ink">
          {payload[0].value}
          {label !== undefined ? '% of segments heavy or severe' : ' reports'}
        </p>
      </div>
    ) : null;

  const metric = (label: string, value: string, pct: number, color: string) => (
    <div>
      <div className="mb-1.5 flex justify-between text-xs">
        <span className="text-ink-muted">{label}</span>
        <span className="font-mono text-ink">{value}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-sand-200">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
      </div>
    </div>
  );

  return (
    <div className="h-full space-y-4 overflow-y-auto p-3 md:p-6">
      {/* Hero */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <PageHeading
          size="lg"
          eyebrow="Network — Performance — Insight"
          title="The City"
          accent="In Numbers"
          description={a.source_note}
        />
        <div className="glass-dark flex items-center gap-4 self-start rounded-full py-2 pl-5 pr-2 lg:self-auto">
          <div className="leading-tight">
            <p className="text-[10px] uppercase tracking-[0.25em] text-sand-300">Generated</p>
            <p className="font-mono text-sm text-sand-50">{new Date(a.generated_at).toLocaleTimeString('en-IN')}</p>
          </div>
          <button
            onClick={fetchAnalytics}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-sand-50 text-ink"
            aria-label="Refresh analytics"
            title="Refresh"
          >
            <Clock className="h-4 w-4" />
          </button>
        </div>
      </div>

      <StatStrip
        items={[
          { icon: <AlertTriangle className="h-4 w-4" />, value: c?.incidents_total ?? '—', label: 'Total incidents' },
          { icon: <Hourglass className="h-4 w-4" />, value: c?.pending ?? '—', label: 'Pending review' },
          { icon: <CheckCircle2 className="h-4 w-4" />, value: c?.verified ?? '—', label: 'Verified' },
          { icon: <Ambulance className="h-4 w-4" />, value: a.emergency_time_saved.sessions, label: 'Emergency runs' },
        ]}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard title="Active closures" value={c?.active_closures ?? '—'} subtitle={`${c?.duplicate_candidates ?? 0} duplicate candidates`} />
        <StatCard
          title="Registered users"
          value={c?.users ?? '—'}
          subtitle={c?.users_by_role ? Object.entries(c.users_by_role).map(([r, n]) => `${n} ${r}`).join(' · ') : undefined}
        />
        <StatCard title="Road segments" value={network?.edges ?? '—'} subtitle={network ? `${network.nodes} junctions` : undefined} />
        <StatCard title="Signalised junctions" value={network?.signals ?? '—'} subtitle={`${sig.length} simulated so far`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-4xl border border-white/80 bg-white/55 p-6 lg:col-span-2">
          <div className="mb-4 flex items-end justify-between gap-2">
            <div>
              <p className="eyebrow flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> Six weeks of simulated traffic</p>
              <h3 className="display text-2xl">Congestion by hour</h3>
            </div>
            {peakRow && <span className="text-[11px] text-ink-muted">Peak {peak}% at {peakRow.hour}:00 IST</span>}
          </div>
          <div className="h-64">
            {hourly.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-ink-muted">No traffic data loaded yet.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourly} margin={{ top: 10, right: 0, bottom: 0, left: -20 }}>
                  <CartesianGrid strokeDasharray="2 6" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#B3ADA8' }} axisLine={false} tickLine={false} interval={1} />
                  <YAxis tick={{ fontSize: 11, fill: '#B3ADA8' }} axisLine={false} tickLine={false} unit="%" />
                  <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(227,160,52,0.08)' }} />
                  <Bar dataKey="value" radius={[8, 8, 8, 8]} maxBarSize={22} isAnimationActive={false}>
                    {hourly.map((h) => (
                      <Cell key={h.hour} fill={h.value === peak ? '#E3A034' : '#E9E4DE'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <p className="mt-3 text-[11px] text-ink-faint">
            Share of road segments moving below half their free-flow speed, averaged per hour of day.
          </p>
        </section>

        <section className="rounded-4xl border border-white/80 bg-white/55 p-6">
          <p className="eyebrow">Open reports</p>
          <h3 className="display text-2xl">Incidents by type</h3>
          {incidentTypes.length === 0 ? (
            <div className="flex h-52 items-center justify-center text-sm text-ink-muted">No incidents yet.</div>
          ) : (
            <>
              <div className="relative h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={incidentTypes}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={58}
                      outerRadius={82}
                      paddingAngle={3}
                      cornerRadius={6}
                      stroke="none"
                      isAnimationActive={false}
                    >
                      {incidentTypes.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip content={<ChartTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-3xl font-light text-ink">{incidentTotal}</span>
                  <span className="text-[10px] uppercase tracking-[0.2em] text-ink-muted">reports</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {incidentTypes.map((t, i) => (
                  <div key={t.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-ink-soft">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {t.name}
                    </span>
                    <span className="font-mono text-ink-muted">{t.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-4xl border border-white/80 bg-white/55 p-6">
          <p className="eyebrow">Held-out test week · {a.prediction_model ?? 'model offline'}</p>
          <h3 className="display mb-5 text-2xl">Prediction error</h3>
          {pe15 || pe30 ? (
            <div className="space-y-4">
              {pe15 && metric('15 min · model MAE', `${pe15.mae_model_kmph} km/h`, (pe15.mae_model_kmph / maxMae) * 100, '#E9E4DE')}
              {pe15 && metric('15 min · baseline MAE', `${pe15.mae_baseline_kmph} km/h`, (pe15.mae_baseline_kmph / maxMae) * 100, '#E3A034')}
              {pe30 && metric('30 min · model MAE', `${pe30.mae_model_kmph} km/h`, (pe30.mae_model_kmph / maxMae) * 100, '#E9E4DE')}
              {pe30 && metric('30 min · baseline MAE', `${pe30.mae_baseline_kmph} km/h`, (pe30.mae_baseline_kmph / maxMae) * 100, '#E3A034')}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">The ML service is offline, so model metrics are unavailable.</p>
          )}
          <p className="mt-4 text-[11px] text-ink-faint">
            Mean absolute error of predicted speed. Lower is better; the baseline assumes speed stays the same.
          </p>
        </section>

        <section className="glass-dark rounded-4xl p-6">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-sand-300">
            <TrendingUp className="h-3.5 w-3.5" /> Signal improvement
          </p>
          <p className="mt-4 font-display text-6xl font-light text-bronze-light">{avgSigPct != null ? `${avgSigPct}%` : '—'}</p>
          <p className="text-sm text-sand-200">
            {avgSigPct != null ? 'average wait reduction' : 'Run a signal optimisation to populate this.'}
          </p>
          <div className="mt-5 space-y-2 border-t border-white/10 pt-4">
            {sig.slice(0, 4).map((s) => (
              <div key={s.junction_id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-sand-200">{s.junction_id}</span>
                <span className="shrink-0 font-mono text-sand-50">
                  {Math.round(s.avg_wait_before_s)}s → <span className="text-traffic-green">{Math.round(s.avg_wait_after_s)}s</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-4xl border border-white/80 bg-white/55 p-6">
          <p className="eyebrow flex items-center gap-2"><Ambulance className="h-3.5 w-3.5" /> Emergency routing</p>
          <h3 className="display mb-4 text-2xl">Time saved</h3>
          <p className="font-display text-5xl font-light text-ink">{a.emergency_time_saved.total_saved_min} min</p>
          <p className="mt-1 text-sm text-ink-muted">
            across {a.emergency_time_saved.sessions} simulated runs · {a.emergency_time_saved.avg_saved_min} min average
          </p>
        </section>
      </div>

      {a.route_usage && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <section className="glass-dark rounded-4xl p-6">
            <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.25em] text-sand-300">
              <RouteIcon className="h-3.5 w-3.5" /> Route usage
            </p>
            <p className="mt-4 font-display text-6xl font-light text-bronze-light">
              {a.route_usage.followed_pct != null ? `${a.route_usage.followed_pct}%` : '—'}
            </p>
            <p className="text-sm text-sand-200">
              {a.route_usage.followed_pct != null ? 'of chosen routes were the recommended one' : 'No route chosen yet. Use "Use this route" in the Route Planner.'}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4 text-sm">
              <div>
                <div className="font-display text-2xl text-sand-50">{a.route_usage.searches}</div>
                <div className="text-[11px] text-sand-300">route searches</div>
              </div>
              <div>
                <div className="font-display text-2xl text-sand-50">{a.route_usage.chosen}</div>
                <div className="text-[11px] text-sand-300">with a chosen route</div>
              </div>
            </div>
          </section>

          <section className="rounded-4xl border border-white/80 bg-white/55 p-6">
            <p className="eyebrow">Which routes people use</p>
            <h3 className="display mb-4 text-2xl">Chosen route types</h3>
            {a.route_usage.chosen_by_type.length === 0 ? (
              <p className="text-sm text-ink-muted">No choices yet.</p>
            ) : (
              <div className="space-y-3">
                {a.route_usage.chosen_by_type.map((t) => {
                  const pct = a.route_usage!.chosen ? Math.round((100 * t.count) / a.route_usage!.chosen) : 0;
                  return (
                    <div key={t.type}>
                      <div className="flex justify-between text-sm">
                        <span className="capitalize text-ink">{t.type.replace('_', ' ')}</span>
                        <span className="text-ink-muted">{t.count} · {pct}%</span>
                      </div>
                      <div className="mt-1 h-2 rounded-full bg-sand-200">
                        <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: routeColor(t.type) }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-4xl border border-white/80 bg-white/55 p-6">
            <p className="eyebrow">All users</p>
            <h3 className="display mb-4 text-2xl">Most searched trips</h3>
            {a.route_usage.top_trips.length === 0 ? (
              <p className="text-sm text-ink-muted">No searches yet.</p>
            ) : (
              <ol className="space-y-2.5">
                {a.route_usage.top_trips.map((t, i) => (
                  <li key={`${t.source.node_id}-${t.destination.node_id}`} className="flex items-start gap-3 text-sm">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] text-sand-50">{i + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-ink" title={`${t.source.name} → ${t.destination.name}`}>
                        {tripLabel(t.source.node_id, t.source.name)} → {tripLabel(t.destination.node_id, t.destination.name)}
                      </span>
                      <span className="text-[11px] text-ink-faint">{t.searches} {t.searches === 1 ? 'search' : 'searches'} · {t.chosen} chosen</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
