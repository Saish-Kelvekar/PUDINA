import { useState, useCallback, useEffect, useMemo } from 'react';
import { useToast } from '@/components/ui/Toast';
import { StatStrip } from '@/components/ui/StatCard';
import { PageHeading, SectionLabel } from '@/components/layout/PageHeading';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { MapView, type MapPin } from '@/components/MapView';
import { apiClient } from '@/api/api';
import type { EdgeCongestion, Junction, SignalSimulation } from '@/types';
import { LoadingState, ErrorState } from '@/components/ui/ErrorState';
import { Play, Timer, Gauge, Clock, TrendingDown, Siren, ArrowRight } from 'lucide-react';
import { istTime } from '@/lib/utils';

export default function SignalOptimization() {
  const { add } = useToast() as any;
  const [junctions, setJunctions] = useState<Junction[]>([]);
  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [junctionId, setJunctionId] = useState('');
  const [mode, setMode] = useState<'optimize' | 'emergency'>('optimize');
  const [approachId, setApproachId] = useState('');
  const [result, setResult] = useState<SignalSimulation | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadJunctions = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const [list, flow] = await Promise.all([apiClient.getJunctions(), apiClient.getTrafficFlow().catch(() => [])]);
      setJunctions(list);
      setEdges(flow);
      const preferred = list.find((j) => j.junction_id === 'J-n2666') ?? list[0];
      if (preferred) {
        setJunctionId(preferred.junction_id);
        setApproachId(preferred.approaches[0]?.approach_id ?? '');
      }
    } catch (err: any) {
      setListError(err.message || 'Could not load junctions');
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadJunctions();
  }, [loadJunctions]);

  const junction = junctions.find((j) => j.junction_id === junctionId) ?? null;
  const approachLabel = useMemo(() => {
    const m = new Map<string, string>();
    junction?.approaches.forEach((a) => m.set(a.approach_id, a.label));
    return (id: string) => m.get(id) ?? id;
  }, [junction]);

  const run = useCallback(async () => {
    if (!junction) return;
    setRunning(true);
    setError(null);
    try {
      const res = await apiClient.simulateSignal(junction.junction_id, mode, mode === 'emergency' ? approachId : undefined);
      setResult(res);
      add?.('success', 'Simulation complete', `${junction.label}: ${res.improvement.avg_wait_change_pct}% average wait`);
    } catch (err: any) {
      setResult(null);
      const msg = err.code === 'ML_UNAVAILABLE'
        ? 'The ML service is not running. Start it (port 8000) to simulate signals.'
        : err.message || 'Simulation failed';
      setError(msg);
      add?.('error', 'Simulation failed', msg);
    } finally {
      setRunning(false);
    }
  }, [junction, mode, approachId, add]);

  if (loadingList) return <LoadingState message="Loading signalised junctions…" />;
  if (listError) return <ErrorState title="Unable to load junctions" message={listError} onRetry={loadJunctions} />;

  const maxGreen = result
    ? Math.max(1, ...result.current.phases.map((p) => p.green_s), ...result.optimized.phases.map((p) => p.green_s))
    : 1;
  const queueBy = new Map(result?.queues.map((q) => [q.approach_id, q]) ?? []);
  const reasonBy = new Map(result?.reasons.map((r) => [r.approach_id, r.text]) ?? []);
  const pins: MapPin[] = junction ? [{ lat: junction.lat, lng: junction.lng, label: '●', color: '#B8453A', title: junction.label }] : [];
  const waitChange = result?.improvement.avg_wait_change_pct ?? 0;

  return (
    <div className="h-full overflow-y-auto p-3 md:p-5">
      <div className="grid gap-4 lg:h-full lg:grid-cols-[360px_minmax(0,1fr)]">
        {/* Inputs */}
        <aside className="space-y-5 rounded-4xl border border-white/80 bg-white/45 p-6 lg:overflow-y-auto">
          <PageHeading
            eyebrow="Adaptive — Timing — Simulation"
            title="Signals In"
            accent="Sync"
            description="Pick a signalised junction. The optimiser re-splits green time from live queues and simulates the result."
          />

          <Select
            label="Junction"
            value={junctionId}
            onChange={(e) => {
              const j = junctions.find((x) => x.junction_id === e.target.value);
              setJunctionId(e.target.value);
              setApproachId(j?.approaches[0]?.approach_id ?? '');
              setResult(null);
            }}
          >
            {junctions.map((j) => (
              <option key={j.junction_id} value={j.junction_id}>
                {j.label} ({j.junction_id})
              </option>
            ))}
          </Select>

          <div className="space-y-1.5">
            <span className="block pl-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">Mode</span>
            <div className="segmented">
              <button type="button" data-active={mode === 'optimize'} onClick={() => { setMode('optimize'); setResult(null); }}>
                Optimise
              </button>
              <button type="button" data-active={mode === 'emergency'} onClick={() => { setMode('emergency'); setResult(null); }}>
                Emergency priority
              </button>
            </div>
          </div>

          {mode === 'emergency' && junction && (
            <Select label="Emergency vehicle arrives from" value={approachId} onChange={(e) => setApproachId(e.target.value)}>
              {junction.approaches.map((a) => (
                <option key={a.approach_id} value={a.approach_id}>{a.label}</option>
              ))}
            </Select>
          )}

          {junction && (
            <div className="space-y-2">
              <SectionLabel right={<span className="text-[11px] text-ink-faint">{junction.approaches.length}</span>}>Approaches</SectionLabel>
              {junction.approaches.map((a, i) => (
                <div key={a.approach_id} className="flex items-center gap-2.5 rounded-2xl bg-white/55 px-3.5 py-2 text-xs">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[10px] text-sand-50">{i + 1}</span>
                  <span className="truncate text-ink">{a.label}</span>
                </div>
              ))}
              <p className="px-1 text-[11px] text-ink-faint">
                Current plan: {junction.current_timing.cycle_s}s cycle, {junction.current_timing.green_s_each}s green each.
              </p>
            </div>
          )}

          <Button onClick={run} variant={mode === 'emergency' ? 'danger' : 'primary'} size="lg" className="w-full" loading={running} disabled={!junction}>
            {mode === 'emergency' ? <Siren className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            {mode === 'emergency' ? 'Simulate emergency priority' : 'Optimise & simulate'}
          </Button>

          {error && (
            <div className="rounded-2xl border border-traffic-red/25 bg-traffic-red/10 px-4 py-3 text-sm text-traffic-red">
              {error}
            </div>
          )}

          <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
            Simulation only — does not control real traffic lights. Queues come from the simulated traffic at the current sim time.
          </p>
        </aside>

        {/* Results */}
        <div className="min-h-0 space-y-4 lg:overflow-y-auto">
          {!result ? (
            <div className="grid min-h-[460px] gap-4 lg:h-full lg:grid-rows-[minmax(0,1fr)_auto]">
              <section className="relative h-[340px] overflow-hidden rounded-4xl border border-white/80 lg:h-auto">
                <MapView
                  key={junctionId}
                  edges={edges}
                  incidents={[]}
                  routes={[]}
                  pins={pins}
                  center={junction ? [junction.lat, junction.lng] : undefined}
                  zoom={17}
                />
              </section>
              <div className="rounded-4xl border border-white/80 bg-white/40 p-6 text-center">
                <p className="eyebrow">{running ? 'Simulating…' : 'Ready'}</p>
                <h3 className="display mt-2 text-2xl">
                  {junction?.label ?? 'Choose a junction'}, then <span className="accent-word">{mode === 'emergency' ? 'clear the way' : 'optimise'}</span>.
                </h3>
              </div>
            </div>
          ) : (
            <>
              <StatStrip
                items={[
                  { icon: <Timer className="h-4 w-4" />, value: `${result.current.cycle_s}s → ${result.optimized.cycle_s}s`, label: 'Cycle length' },
                  { icon: <Clock className="h-4 w-4" />, value: `${result.current.avg_wait_s}s → ${result.optimized.avg_wait_s}s`, label: 'Average wait' },
                  { icon: <Gauge className="h-4 w-4" />, value: `${result.current.max_queue} → ${result.optimized.max_queue}`, label: 'Max queue (cars)' },
                  { icon: <TrendingDown className="h-4 w-4" />, value: `${result.current.throughput} → ${result.optimized.throughput}`, label: `Throughput · ${result.cycles} cycles` },
                ]}
              />

              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
                <section className="rounded-4xl border border-white/80 bg-white/55 p-6">
                  <div className="mb-5 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="eyebrow">{junction?.label ?? result.junction_name ?? result.junction_id} · as of {istTime(result.as_of_utc)} IST</p>
                      <h3 className="display text-2xl">Green time by approach</h3>
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-ink-muted">
                      <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-sand-400" /> Current</span>
                      <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-full bg-ink" /> Optimised</span>
                    </div>
                  </div>
                  <div className="space-y-5">
                    {result.optimized.phases.map((p) => {
                      const before = result.current.phases.find((c) => c.approach_id === p.approach_id);
                      const q = queueBy.get(p.approach_id);
                      const isEmergencyApproach = result.mode === 'emergency' && p.approach_id === approachId;
                      return (
                        <div key={p.approach_id}>
                          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                              {approachLabel(p.approach_id)}
                              {isEmergencyApproach && <Siren className="h-3.5 w-3.5 text-traffic-red" />}
                            </span>
                            {q && (
                              <span className="text-[11px] text-ink-muted">
                                {q.queue_now} queued · {q.arrivals_per_min}/min arriving
                              </span>
                            )}
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-3">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-200">
                                <div className="h-full rounded-full bg-sand-400" style={{ width: `${((before?.green_s ?? 0) / maxGreen) * 100}%` }} />
                              </div>
                              <span className="w-12 text-right font-mono text-[11px] text-ink-muted">{before?.green_s ?? '—'}s</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-200">
                                <div className="h-full rounded-full bg-ink" style={{ width: `${(p.green_s / maxGreen) * 100}%` }} />
                              </div>
                              <span className="w-12 text-right font-mono text-[11px] text-ink">{p.green_s}s</span>
                            </div>
                          </div>
                          {reasonBy.get(p.approach_id) && (
                            <p className="mt-1.5 flex gap-1.5 text-[11px] leading-relaxed text-ink-muted">
                              <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-bronze" />
                              {reasonBy.get(p.approach_id)}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <section className="glass-dark flex flex-col justify-between rounded-4xl p-6">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-sand-300">Result</p>
                    <p className="mt-3 font-display text-6xl font-light text-bronze-light">
                      {waitChange > 0 ? '+' : ''}{waitChange}%
                    </p>
                    <p className="mt-1 text-sm text-sand-200">
                      average wait ({result.improvement.avg_wait_saved_s}s {result.improvement.avg_wait_saved_s >= 0 ? 'saved' : 'added'} per vehicle)
                    </p>
                    <div className="my-5 h-px bg-white/10" />
                    <p className="font-display text-3xl font-light text-sand-50">
                      {result.improvement.throughput_change_pct > 0 ? '+' : ''}{result.improvement.throughput_change_pct}%
                    </p>
                    <p className="mt-1 text-sm text-sand-200">throughput</p>
                    {result.red_wait_saved_s != null && (
                      <>
                        <div className="my-5 h-px bg-white/10" />
                        <p className="font-display text-3xl font-light text-traffic-red">−{result.red_wait_saved_s}s</p>
                        <p className="mt-1 text-sm text-sand-200">red-light wait for the emergency vehicle</p>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setResult(null)}
                    className="mt-6 rounded-full bg-sand-50 px-4 py-2 text-xs font-semibold text-ink hover:bg-white"
                  >
                    Back to map
                  </button>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
