import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { apiClient, DEFAULT_CENTER } from '@/api/api';
import { useLiveIncidents } from '@/lib/realtime';
import type { EdgeCongestion, Incident } from '@/types';
import { LoadingState, ErrorState } from '@/components/ui/ErrorState';
import { isoToLocalTime } from '@/lib/colors';
import { MapPin, Send, Crosshair, CheckCircle2 } from 'lucide-react';
import { StatusPill } from '@/components/ui/Badge';
import { MapStage, MapChip } from '@/components/layout/MapStage';
import { PageHeading } from '@/components/layout/PageHeading';

const INCIDENT_TYPES: { value: string; label: string }[] = [
  { value: 'accident', label: 'Accident' },
  { value: 'breakdown', label: 'Vehicle breakdown' },
  { value: 'roadwork', label: 'Roadwork' },
  { value: 'flooding', label: 'Flooding' },
  { value: 'closure', label: 'Road closure' },
  { value: 'event', label: 'Event / crowd' },
  { value: 'other', label: 'Other' },
];

const SEVERITIES: { value: string; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

export default function ReportIncident() {
  const { add } = useToast() as any;
  const [type, setType] = useState('accident');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [lanesBlocked, setLanesBlocked] = useState(0);
  const [selected, setSelected] = useState<{ lat: number; lng: number } | null>(null);
  const [edges, setEdges] = useState<EdgeCongestion[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [mapLoading, setMapLoading] = useState(true);
  const [mapError, setMapError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [lastSubmitted, setLastSubmitted] = useState<Incident | null>(null);

  const fetchMap = useCallback(async () => {
    setMapLoading(true);
    setMapError(null);
    try {
      const [t, i] = await Promise.all([apiClient.getTrafficFlow(), apiClient.getIncidents()]);
      setEdges(t);
      setIncidents(i);
    } catch (err: any) {
      setMapError(err.message || 'Failed to load map data');
    } finally {
      setMapLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMap();
  }, [fetchMap]);

  useLiveIncidents(() => {
    apiClient.getIncidents().then(setIncidents).catch(() => {});
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) {
      setSubmitError('Please click a location on the map first');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await apiClient.createIncident({
        type,
        lat: selected.lat,
        lng: selected.lng,
        description: description.trim(),
        severity,
        lanes_blocked: lanesBlocked,
        is_closure: type === 'closure' ? true : undefined,
      });
      setLastSubmitted(created);
      setIncidents((prev) => [created, ...prev.filter((i) => i.id !== created.id)]);
      add?.('success', 'Incident reported', 'Your report has been submitted for review');
      setDescription('');
      setLanesBlocked(0);
      setSelected(null);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit incident');
      add?.('error', 'Report failed', err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (mapLoading) {
    return <LoadingState message="Loading map and incidents…" />;
  }
  if (mapError) {
    return <ErrorState title="Unable to load map" message={mapError} onRetry={fetchMap} />;
  }

  return (
    <MapStage
      map={
        <MapView
          edges={edges}
          incidents={incidents}
          routes={[]}
          center={selected ? [selected.lat, selected.lng] : DEFAULT_CENTER}
          zoom={selected ? 16 : 15}
          onMapClick={(lat, lng) => setSelected({ lat, lng })}
        />
      }
      overlay={
        <div className="absolute left-4 top-4 z-10 flex flex-col items-start gap-2 lg:left-[392px]">
          <MapChip>
            <Crosshair className="h-3.5 w-3.5 text-bronze" />
            {selected ? 'Location selected — click to change' : 'Click the map to choose the incident location'}
          </MapChip>
          {selected && (
            <MapChip className="bg-ink/90 text-sand-50 border-white/10">
              <MapPin className="h-3.5 w-3.5 text-bronze-light" />
              <span className="font-mono">{selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}</span>
            </MapChip>
          )}
        </div>
      }
      panel={
        <>
          <PageHeading
            eyebrow="Citizen — Reports — Verification"
            title="Report An"
            accent="Incident"
            description="Pin the spot on the map, describe what you see. Administrators review every report."
          />

          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              label="Incident type"
              value={type}
              onChange={(e) => setType(e.target.value as any)}
            >
              {INCIDENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>

            <div className="space-y-1.5">
              <span className="block pl-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">Severity</span>
              <div className="segmented" role="radiogroup" aria-label="Severity">
                {SEVERITIES.map((s) => (
                  <button
                    key={s.value}
                    type="button"
                    role="radio"
                    aria-checked={severity === s.value}
                    data-active={severity === s.value}
                    onClick={() => setSeverity(s.value)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Description (optional)"
              type="text"
              placeholder="e.g. two-car collision, lane blocked"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <div className="space-y-1.5">
              <span className="block pl-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">Lanes blocked</span>
              <div className="segmented" role="radiogroup" aria-label="Lanes blocked">
                {[0, 1, 2, 3].map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={lanesBlocked === n}
                    data-active={lanesBlocked === n}
                    onClick={() => setLanesBlocked(n)}
                  >
                    {n === 0 ? 'None' : n === 3 ? '3+' : n}
                  </button>
                ))}
              </div>
            </div>

            <p className="px-1 text-[11px] leading-relaxed text-ink-faint">
              Pick a point within 200 m of a road. Reported under your account and labelled{' '}
              <span className="font-mono text-ink-muted">USER_REPORTED</span>; it stays{' '}
              <span className="font-semibold text-ink-muted">pending</span> until an admin verifies it.
            </p>

            <Button type="submit" variant="primary" size="lg" className="w-full" loading={submitting}>
              <Send className="mr-2 h-4 w-4" /> Submit report
            </Button>
          </form>

          {submitError && (
            <div className="rounded-2xl border border-traffic-red/25 bg-traffic-red/10 px-4 py-3 text-sm text-traffic-red">
              {submitError}
            </div>
          )}

          {lastSubmitted && (
            <div className="glass-dark space-y-2 rounded-3xl p-5 animate-slide-up">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-traffic-green" />
                <span className="font-display text-lg font-light">Report submitted</span>
              </div>
              <div className="text-xs text-sand-300">
                ID #{lastSubmitted.id} · {isoToLocalTime(lastSubmitted.created_at)} ·{' '}
                <span className="capitalize text-bronze-light">{lastSubmitted.status}</span>
              </div>
              <button
                onClick={() => setLastSubmitted(null)}
                className="mt-1 w-full rounded-full bg-sand-50 px-4 py-2 text-xs font-semibold text-ink hover:bg-white"
              >
                Report another
              </button>
            </div>
          )}
        </>
      }
      bottom={
        <div className="glass rounded-3xl px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="eyebrow">Recent reports</p>
            <span className="text-[11px] text-ink-faint">{incidents.length} total</span>
          </div>
          {incidents.length === 0 ? (
            <p className="text-sm text-ink-muted">No recent reports.</p>
          ) : (
            <ul className="flex gap-2 overflow-x-auto pb-1">
              {incidents.slice(0, 5).map((inc) => (
                <li
                  key={inc.id}
                  className="flex min-w-[170px] items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/60 px-3.5 py-2.5"
                >
                  <div>
                    <div className="text-sm font-semibold capitalize text-ink">{inc.type}</div>
                    <div className="text-[10px] text-ink-faint">{isoToLocalTime(inc.created_at)}</div>
                  </div>
                  <StatusPill status={inc.status} />
                </li>
              ))}
            </ul>
          )}
        </div>
      }
    />
  );
}
