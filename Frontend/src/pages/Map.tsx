import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { Legend, IncidentLegend } from '@/components/Legend';
import { StatStrip } from '@/components/ui/StatCard';
import { SourceBadge } from '@/components/ui/Badge';
import { LoadingState, ErrorState } from '@/components/ui/ErrorState';
import { MapStage, MapChip } from '@/components/layout/MapStage';
import { PageHeading } from '@/components/layout/PageHeading';
import { apiClient } from '@/api/api';
import type { EdgeCongestion, Incident } from '@/types';
import { cn, istTime } from '@/lib/utils';
import { useLiveIncidents } from '@/lib/realtime';
import { Layers, RefreshCw, Activity, AlertTriangle, Clock, Gauge, ArrowUpRight } from 'lucide-react';

export default function MapPage() {
  const { add } = useToast() as any;
  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [simTime, setSimTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPredicted, setShowPredicted] = useState(false);
  const [predicted, setPredicted] = useState<Array<EdgeCongestion & { predicted_congestion?: number }>>([]);

  const fetchMapData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [trafficRes, incidentsRes, predRes, clock] = await Promise.all([
        apiClient.getTrafficFlow(),
        apiClient.getIncidents(),
        apiClient.getPredictions(15).catch(() => null),
        apiClient.getSimClock().catch(() => null),
      ]);
      setEdges(trafficRes);
      setIncidents(incidentsRes);
      setPredicted(predRes?.items ?? []);
      setSimTime(clock?.sim_time_utc ?? null);
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

  useLiveIncidents((e) => {
    apiClient.getIncidents().then(setIncidents).catch(() => {});
    add?.('info', e.type === 'incident:new' ? 'New incident reported' : 'Incident verified',
      e.incident ? `${e.incident.category} · #${e.incident.id}` : undefined);
  });

  const handleRetry = () => fetchMapData();

  if (loading && edges.length === 0 && !error) {
    return <LoadingState message="Loading traffic map…" />;
  }
  if (error && edges.length === 0) {
    return <ErrorState title="Unable to load map" message={error} onRetry={handleRetry} />;
  }

  const withData = edges.filter((e) => e.congestion >= 0);
  const congestedCount = withData.filter((e) => e.congestion > 0.5).length;
  const avgSpeed = withData.length
    ? Math.round(withData.reduce((s, e) => s + (e.speed_kmph ?? 0), 0) / withData.length)
    : 0;
  const verifiedCount = incidents.filter((i) => i.status === 'verified').length;

  return (
    <MapStage
      map={
        <MapView
          edges={edges}
          incidents={incidents}
          routes={[]}
          predictedEdges={predicted}
          showPredicted={showPredicted}
        />
      }
      overlay={
        <div className="absolute left-4 top-4 z-10 lg:left-[392px]">
          <MapChip>
            <span className={cn('h-1.5 w-1.5 rounded-full bg-traffic-green', loading ? 'animate-ping' : 'animate-pulse')} />
            Data as of {istTime(simTime)} IST
            <SourceBadge source="SIMULATED" />
          </MapChip>
        </div>
      }
      panel={
        <>
          <PageHeading
            eyebrow="Live — Congestion — Incidents"
            title="City In"
            accent="Motion"
            description="Every road segment coloured by live congestion. Click a line or marker for details."
          />

          <div className="flex flex-wrap gap-2">
            <button onClick={fetchMapData} className="btn-secondary" title="Refresh data">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} /> Refresh
            </button>
            <button
              onClick={() => setShowPredicted((v) => !v)}
              className={showPredicted ? 'btn-primary' : 'btn-secondary'}
              title={showPredicted ? 'Hide predicted congestion' : 'Show predicted congestion (AI)'}
              aria-pressed={showPredicted}
            >
              <Layers className="h-4 w-4" /> AI forecast
            </button>
          </div>

          <Legend showPredicted={showPredicted} />
          <IncidentLegend />

          <div className="rounded-3xl border border-white/80 bg-white/40 p-4">
            <p className="eyebrow mb-2">How to use</p>
            <ul className="space-y-1.5 text-xs leading-relaxed text-ink-soft">
              <li>— Coloured lines show live congestion by road segment.</li>
              <li>— Round markers are reported incidents.</li>
              <li>— Toggle AI forecast for the 15-minute prediction layer (dotted lines).</li>
              <li>— New reports appear live, no refresh needed.</li>
              <li>— Open Route Planner to compare journeys.</li>
            </ul>
          </div>
        </>
      }
      bottom={
        <div className="flex flex-col gap-3 xl:flex-row xl:items-stretch">
          <StatStrip
            className="flex-1"
            items={[
              { icon: <Activity className="h-4 w-4" />, value: withData.length, label: `Segments monitored · of ${edges.length} streets` },
              { icon: <Gauge className="h-4 w-4" />, value: congestedCount, label: 'Heavy or severe' },
              { icon: <AlertTriangle className="h-4 w-4" />, value: incidents.length, label: `Active incidents · ${verifiedCount} verified` },
              { icon: <Clock className="h-4 w-4" />, value: `${avgSpeed} km/h`, label: 'Average speed' },
            ]}
          />
          <Link
            to="/route"
            className="glass-dark group flex items-center justify-between gap-4 rounded-3xl px-6 py-5 xl:w-72"
          >
            <div>
              <p className="font-display text-xl font-light leading-tight">
                Plan a smarter <span className="italic text-bronze-light">route</span>
              </p>
              <p className="mt-1 text-xs text-sand-300">Compare shortest, fastest &amp; AI-optimised.</p>
            </div>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sand-50 text-ink transition-transform group-hover:rotate-45">
              <ArrowUpRight className="h-5 w-5" />
            </span>
          </Link>
        </div>
      }
    />
  );
}
