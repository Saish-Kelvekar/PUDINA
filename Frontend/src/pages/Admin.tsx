import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView, type MapLine } from '@/components/MapView';
import { StatCard } from '@/components/ui/StatCard';
import { Badge, StatusPill } from '@/components/ui/Badge';
import { MapStage } from '@/components/layout/MapStage';
import { PageHeading } from '@/components/layout/PageHeading';
import { apiClient, loadGraph } from '@/api/api';
import type { AdminOverview, DuplicatePair, Incident, NetworkImpact } from '@/types';
import { LoadingState, ErrorState } from '@/components/ui/ErrorState';
import { isoToLocalTime, statusColor, congestionColor } from '@/lib/colors';
import { istTime } from '@/lib/utils';
import { useLiveIncidents } from '@/lib/realtime';
import { CheckCircle2, XCircle, MinusCircle, AlertTriangle, MapPin, GitMerge, ChevronLeft, ChevronRight, Clock, Camera } from 'lucide-react';
import { Link } from 'react-router-dom';

const LEVEL_AFTER: Record<string, number> = { flowing: 0.1, moderate: 0.4, heavy: 0.65, severe: 0.9, closed: 1 };

export default function Admin() {
  const { add } = useToast() as any;
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicatePair[]>([]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [impact, setImpact] = useState<NetworkImpact | null>(null);
  const [impactLines, setImpactLines] = useState<MapLine[]>([]);
  const [impactFocus, setImpactFocus] = useState<[number, number] | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'incidents' | 'duplicates' | 'impact'>('incidents');

  const fetchAdmin = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [incs, ov] = await Promise.all([apiClient.getIncidents(), apiClient.getAdminOverview()]);
      setIncidents(incs);
      setOverview(ov);
      setDuplicates(await apiClient.getDuplicateCandidates(incs).catch(() => []));
    } catch (err: any) {
      setError(err.message || 'Failed to load admin data');
      add?.('error', 'Admin load failed', 'Could not load admin dashboard');
    } finally {
      setLoading(false);
    }
  }, [add]);

  useEffect(() => {
    fetchAdmin();
  }, [fetchAdmin]);

  useLiveIncidents((e) => {
    if (e.type === 'incident:new') add?.('info', 'New incident reported', e.incident ? `${e.incident.category} · #${e.incident.id}` : undefined);
    fetchAdmin();
  });

  const stepClock = async (action: 'next' | 'prev') => {
    setBusy(true);
    try {
      const r = await apiClient.stepSimClock(action);
      setOverview((o) => (o ? { ...o, sim_time_utc: r.sim_time_utc } : o));
      add?.('info', 'Simulation clock moved', `Now ${istTime(r.sim_time_utc)} IST. Traffic, predictions and routes follow it.`);
    } catch (err: any) {
      add?.('error', 'Clock change failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMerge = async (pair: DuplicatePair) => {
    const [a, b] = pair.incidents;
    // Merge the newer report into the older one.
    const [keep, drop] = new Date(a.created_at) <= new Date(b.created_at) ? [a, b] : [b, a];
    try {
      await apiClient.mergeIncident(drop.id, keep.id);
      add?.('success', 'Reports merged', `#${drop.id} merged into #${keep.id}`);
      await fetchAdmin();
    } catch (err: any) {
      add?.('error', 'Merge failed', err.message);
    }
  };

  const handleAction = async (id: number | string, status: string) => {
    try {
      await apiClient.updateIncidentStatus(id, status);
      setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
      add?.('success', `Incident ${status}`, `Report #${id} marked as ${status}`);
      await fetchAdmin();
    } catch (err: any) {
      add?.('error', `Could not mark #${id} as ${status}`, err.message);
    }
  };

  const handleImpact = async (inc: Incident) => {
    try {
      const [res, g] = await Promise.all([apiClient.getNetworkImpact(inc.id, inc.is_closure ? 'closure' : undefined), loadGraph()]);
      const lines: MapLine[] = [];
      for (const a of res.affected_segments) {
        const e = g.edgesById.get(a.segment_id);
        if (!e) continue;
        const closed = a.congestion_level_after === 'closed';
        lines.push({
          coords: e.coords,
          color: closed ? '#1F1D1B' : congestionColor(LEVEL_AFTER[a.congestion_level_after] ?? -1),
          weight: a.hops === 0 ? 8 : 6,
          dash: closed ? '4, 6' : undefined,
          title: `${e.name ?? a.segment_id}: ${a.congestion_level_after}${a.extra_delay_s != null ? ` · +${Math.round(a.extra_delay_s)}s` : ''}`,
        });
      }
      if (res.diversion_route) {
        lines.push({ coords: res.diversion_route.coords, color: '#4A6A8A', weight: 5, dash: '10, 8', title: `Diversion · ${res.diversion_route.eta_min} min` });
      }
      setImpact(res);
      setImpactLines(lines);
      setImpactFocus([inc.lat, inc.lng]);
      setActiveTab('impact');
      add?.('success', 'Network impact', `${res.count} segments affected · +${res.total_extra_delay_min} min total delay`);
    } catch (err: any) {
      add?.('error', 'Impact analysis failed', err.message);
    }
  };

  if (loading && incidents.length === 0) {
    return <LoadingState message="Loading admin dashboard…" />;
  }
  if (error && incidents.length === 0) {
    return <ErrorState title="Admin load failed" message={error} onRetry={fetchAdmin} />;
  }

  const pending = incidents.filter((i) => i.status === 'pending');

  return (
    <MapStage
      map={
        <MapView
          edges={[]}
          incidents={incidents}
          routes={[]}
          lines={activeTab === 'impact' ? impactLines : undefined}
          center={activeTab === 'impact' ? impactFocus : undefined}
          zoom={activeTab === 'impact' ? 16 : 15}
        />
      }
      panel={
        <>
          <PageHeading
            eyebrow="Review — Verify — Resolve"
            title="Control"
            accent="Room"
            description="Triage citizen reports, merge duplicates and inspect network impact."
          />

          {overview && (
            <div className="grid grid-cols-2 gap-3">
              <StatCard title="Total incidents" value={overview.incidents?.total ?? incidents.length} />
              <StatCard
                title="Needs review"
                value={overview.incidents?.pending ?? pending.length}
                className="bg-traffic-yellow/10"
              />
            </div>
          )}

          {overview && (
            <div className="flex items-center justify-between gap-2 rounded-3xl border border-white/80 bg-white/55 px-4 py-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
                  <Clock className="h-3 w-3" /> Simulation clock
                </p>
                <p className="font-display text-xl font-light text-ink">{istTime(overview.sim_time_utc)} IST</p>
                <p className="text-[10px] text-ink-faint">
                  ML service: {overview.ml_service?.status === 'up' ? `up (${overview.ml_service.model_version})` : 'down, baseline in use'}
                </p>
              </div>
              <div className="flex gap-1.5">
                <button disabled={busy} onClick={() => stepClock('prev')} className="icon-btn h-9 w-9 disabled:opacity-40" aria-label="Back 15 minutes" title="Back 15 minutes">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button disabled={busy} onClick={() => stepClock('next')} className="icon-btn h-9 w-9 disabled:opacity-40" aria-label="Forward 15 minutes" title="Forward 15 minutes">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <div className="segmented">
            <button type="button" data-active={activeTab === 'incidents'} onClick={() => setActiveTab('incidents')}>
              All ({incidents.length})
            </button>
            <button type="button" data-active={activeTab === 'duplicates'} onClick={() => setActiveTab('duplicates')}>
              Duplicates ({duplicates.length})
            </button>
          </div>

          {activeTab === 'impact' && impact && (
            <div className="glass-dark space-y-2 rounded-3xl p-5 animate-slide-up">
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-sand-300">Network impact</p>
              <p className="font-display text-5xl font-light text-bronze-light">{impact.count}</p>
              <p className="text-sm text-sand-200">affected segments · +{impact.total_extra_delay_min} min total delay</p>
              {impact.diversion_route && (
                <p className="text-[11px] text-sand-300">
                  Diversion (blue dashes): {impact.diversion_route.distance_km} km, {impact.diversion_route.eta_min} min
                  {impact.detour_minutes != null ? ` · ${impact.detour_minutes} min detour` : ''}
                </p>
              )}
              <p className="text-[11px] text-sand-300">Simulated. Shown on the map around the incident.</p>
              <button
                onClick={() => setActiveTab('incidents')}
                className="mt-2 w-full rounded-full bg-sand-50 px-4 py-2 text-xs font-semibold text-ink hover:bg-white"
              >
                Back to incidents
              </button>
            </div>
          )}

          {activeTab === 'duplicates' && (
            <div className="space-y-3">
              {duplicates.length === 0 ? (
                <p className="px-1 text-sm text-ink-muted">No duplicate candidates detected.</p>
              ) : (
                duplicates.map((d) => (
                  <div key={d.id} className="rounded-3xl border border-white/80 bg-white/55 p-4">
                    <div className="mb-3 flex items-start justify-between">
                      <span className="text-xs font-semibold text-ink">#{d.incidents[0].id} ↔ #{d.incidents[1].id}</span>
                      <Badge variant={d.score > 0.8 ? 'error' : 'warning'}>{Math.round(d.score * 100)}% match</Badge>
                    </div>
                    <div className="flex gap-3">
                      {d.incidents.map((inc) => (
                        <div key={inc.id} className="min-w-0 flex-1 border-r border-ink/10 pr-3 last:border-0 last:pr-0">
                          <div className="text-[10px] text-ink-faint">#{inc.id}</div>
                          <div className="truncate text-xs text-ink">{inc.description}</div>
                          <div className="text-[10px] capitalize text-ink-muted">{inc.type} · {inc.status}</div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => handleMerge(d)}
                      className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-sand-50 hover:bg-ink-soft"
                    >
                      <GitMerge className="h-3.5 w-3.5" /> Merge newer into older
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'incidents' && (
            <div className="space-y-2">
              {incidents.length === 0 ? (
                <p className="px-1 text-sm text-ink-muted">No incidents reported.</p>
              ) : (
                incidents.map((inc) => (
                  <div key={inc.id} className="rounded-3xl border border-white/80 bg-white/55 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold capitalize text-ink">{inc.type}</div>
                        <div className="truncate text-xs text-ink-muted">{inc.description}</div>
                        <div className="mt-0.5 text-[10px] text-ink-faint">
                          {inc.reporter} · {isoToLocalTime(inc.created_at)}
                        </div>
                      </div>
                      <StatusPill status={inc.status} />
                    </div>
                    {inc.status === 'verified' && (
                      <div className="mt-3 flex gap-1.5">
                        <button
                          onClick={() => handleAction(inc.id, 'resolved')}
                          className="flex flex-1 items-center justify-center gap-1 rounded-full border border-ink/15 px-2 py-1.5 text-[11px] font-semibold text-ink-muted hover:bg-white"
                        >
                          <MinusCircle className="h-3.5 w-3.5" /> Mark resolved
                        </button>
                        <button
                          onClick={() => handleImpact(inc)}
                          className="flex flex-1 items-center justify-center gap-1 rounded-full border border-ink/15 px-2 py-1.5 text-[11px] font-semibold text-ink-muted hover:bg-white"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" /> Impact
                        </button>
                        <Link
                          to={`/camera?incident=${inc.id}`}
                          className="flex items-center justify-center rounded-full border border-ink/15 px-2.5 py-1.5 text-ink-muted hover:bg-white"
                          title="Capture evidence"
                          aria-label={`Capture evidence for incident ${inc.id}`}
                        >
                          <Camera className="h-3.5 w-3.5" />
                        </Link>
                      </div>
                    )}
                    {inc.status === 'pending' && (
                      <div className="mt-3 flex gap-1.5">
                        <button
                          onClick={() => handleAction(inc.id, 'verified')}
                          className="flex flex-1 items-center justify-center gap-1 rounded-full bg-ink px-2 py-1.5 text-[11px] font-semibold text-sand-50 hover:bg-ink-soft"
                          title="Verify"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> Verify
                        </button>
                        <button
                          onClick={() => handleAction(inc.id, 'rejected')}
                          className="flex flex-1 items-center justify-center gap-1 rounded-full border border-traffic-red/30 px-2 py-1.5 text-[11px] font-semibold text-traffic-red hover:bg-traffic-red/10"
                          title="Reject"
                        >
                          <XCircle className="h-3.5 w-3.5" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      }
      bottom={
        <div className="glass rounded-3xl px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="eyebrow flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-bronze" /> Incidents on map
            </p>
            <span className="text-[11px] text-ink-faint">
              {incidents.length > 8 ? `Showing 8 of ${incidents.length} · ` : ''}Click for network impact
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {incidents.slice(0, 8).map((inc) => (
              <button
                type="button"
                key={inc.id}
                className="group flex min-w-[180px] items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5 text-left transition-colors hover:bg-white"
                onClick={() => handleImpact(inc)}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white" style={{ backgroundColor: statusColor(inc.status) }} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold capitalize text-ink">{inc.type}</div>
                    <div className="text-[10px] text-ink-faint">
                      <span className="capitalize" style={{ color: statusColor(inc.status) }}>{inc.status}</span> · {isoToLocalTime(inc.created_at)}
                    </div>
                  </div>
                </div>
                <AlertTriangle className="h-4 w-4 shrink-0 text-ink-faint transition-colors group-hover:text-bronze" />
              </button>
            ))}
          </div>
        </div>
      }
    />
  );
}
