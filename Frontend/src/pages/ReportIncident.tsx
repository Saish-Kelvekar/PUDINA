import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { apiClient } from '@/api/api';
import type { EdgeCongestion, Incident } from '@/types';
import { LoadingState, ErrorState } from '@/components/ui/ErrorState';
import { isoToLocalTime } from '@/lib/colors';
import { AlertCircle, MapPin, Send } from 'lucide-react';

const INCIDENT_TYPES: { value: string; label: string }[] = [
  { value: 'accident', label: 'Accident' },
  { value: 'roadblock', label: 'Roadblock' },
  { value: 'flood', label: 'Flooding' },
  { value: 'breakdown', label: 'Vehicle breakdown' },
  { value: 'construction', label: 'Construction' },
  { value: 'congestion', label: 'Congestion' },
  { value: 'other', label: 'Other' },
];

const SEVERITIES: { value: string; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];

// Default center near Central Hub
const DEFAULT_CENTER: [number, number] = [12.9716, 77.5946];

export default function ReportIncident() {
  const { add } = useToast() as any;
  const [type, setType] = useState('accident');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [reporter, setReporter] = useState('anonymous');
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
        description,
        severity,
        reporter,
      });
      setLastSubmitted(created);
      setIncidents((prev) => [created, ...prev]);
      add?.('success', 'Incident reported', 'Your report has been submitted');
      setDescription('');
      setSelected(null);
    } catch (err: any) {
      setSubmitError(err.message || 'Failed to submit incident');
      add?.('error', 'Report failed', 'Could not submit the incident');
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
    <div className="flex h-full w-full">
      {/* Left map */}
      <div className="flex-1 relative min-w-0 flex flex-col">
        <MapView
          edges={edges}
          incidents={incidents}
          routes={[]}
          center={selected ? [selected.lat, selected.lng] : DEFAULT_CENTER}
          zoom={selected ? 15 : 13}
          onMapClick={(lat, lng) => setSelected({ lat, lng })}
        />

        <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
          <p className="text-xs bg-slate-900/90 backdrop-blur px-3 py-1.5 rounded border border-slate-700 text-slate-300 shadow-panel">
            {selected ? 'Location selected — click to change' : 'Click the map to choose incident location'}
          </p>
        </div>

        {selected && (
          <div className="absolute bottom-4 left-4 z-20 flex items-center gap-2 bg-slate-900/90 backdrop-blur px-3 py-2 rounded border border-slate-700 text-sm text-slate-200 shadow-panel">
            <MapPin className="h-4 w-4 text-red-400" />
            <span>{selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}</span>
          </div>
        )}
      </div>

      {/* Right form */}
      <aside className="w-80 bg-slate-900/95 backdrop-blur border-l border-slate-800 flex flex-col shrink-0 z-10">
        <div className="p-4 border-b border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-400" /> Report Incident
          </h2>
          <p className="text-xs text-slate-500 mt-1">Reports are reviewed by administrators</p>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
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

            <Select
              label="Severity"
              value={severity}
              onChange={(e) => setSeverity(e.target.value as any)}
            >
              {SEVERITIES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>

            <Input
              label="Description (optional)"
              type="text"
              placeholder="What do you see? e.g. two-car collision, lane blocked"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />

            <Input
              label="Reporter name (optional)"
              type="text"
              placeholder="anonymous"
              value={reporter}
              onChange={(e) => setReporter(e.target.value)}
            />

            <p className="text-[10px] text-slate-500">
              Source will be labelled <span className="font-mono">USER_REPORTED</span>. Reports start as{" "}
              <span className="font-medium">pending</span> until verified.
            </p>

            <Button type="submit" variant="primary" className="w-full" loading={submitting}>
              <Send className="mr-2 h-4 w-4" /> Submit report
            </Button>
          </form>

          {submitError && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-300">
              {submitError}
            </div>
          )}

          {lastSubmitted && (
            <div className="p-3 rounded-lg bg-green-900/20 border border-green-500/30 text-sm text-green-300 space-y-1">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-400" />
                <span className="font-medium">Report submitted</span>
              </div>
              <div className="text-[10px] text-slate-400">
                ID #{lastSubmitted.id} · {isoToLocalTime(lastSubmitted.created_at)} ·{' '}
                <span className="text-green-400">{lastSubmitted.status}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setLastSubmitted(null)} className="w-full mt-2">
                Report another
              </Button>
            </div>
          )}

          <div className="mt-4 p-3 rounded-lg bg-slate-800 border border-slate-700">
            <p className="text-xs font-medium text-slate-300 mb-2">Nearby recent reports</p>
            {incidents.length === 0 ? (
              <p className="text-[10px] text-slate-500">No recent reports.</p>
            ) : (
              <ul className="space-y-2">
                {incidents.slice(0, 5).map((inc) => (
                  <li key={inc.id} className="flex justify-between items-start">
                    <div className="text-sm text-slate-200">{inc.type}</div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] text-slate-500">{isoToLocalTime(inc.created_at)}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${inc.status === 'verified' ? 'bg-green-900/20 text-green-400 border border-green-500/30' : 'bg-slate-700 text-slate-300 border border-slate-600'}`}>
                        {inc.status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
