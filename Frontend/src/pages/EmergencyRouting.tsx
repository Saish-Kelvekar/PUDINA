import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { apiClient } from '@/api/api';
import type { EmergencyVehicle } from '@/types';
import { LoadingState, ErrorState } from '@/components/ui/ErrorState';
import { formatMinutes } from '@/lib/colors';
import { Ambulance, Play, Truck, ShieldAlert, Clock, Info } from '@/icons';

const VEHICLES: { value: EmergencyVehicle; label: string; icon: React.ReactNode }[] = [
  { value: 'ambulance', label: 'Ambulance', icon: <Ambulance className="h-4 w-4" /> },
  { value: 'fire', label: 'Fire service', icon: <Truck className="h-4 w-4" /> },
  { value: 'police', label: 'Police', icon: <ShieldAlert className="h-4 w-4" /> },
];

const NODES: { id: string; name: string }[] = [
  { id: 'hospital_jn', name: 'Hospital Jn' },
  { id: 'central_hub', name: 'Central Hub' },
  { id: 'tech_park', name: 'Tech Park' },
  { id: 'airport_rd', name: 'Airport Road' },
  { id: 'silk_board', name: 'Silk Board' },
  { id: 'electronic_city', name: 'Electronic City' },
  { id: 'old_town', name: 'Old Town' },
  { id: 'industrial_zone', name: 'Industrial Zone' },
];

export default function EmergencyRouting() {
  const { add } = useToast() as any;
  const [source, setSource] = useState('hospital_jn');
  const [destination, setDestination] = useState('tech_park');
  const [vehicleType, setVehicleType] = useState<EmergencyVehicle>('ambulance');
  const [result, setResult] = useState<{ normal: any; emergency: any; simulation: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRoutes = useCallback(async () => {
    if (source === destination) {
      setError('Select different source and destination');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.emergencyRoutes(source, destination, vehicleType);
      setResult(res);
      add?.('success', 'Emergency route computed', 'Priority route calculated (simulation)');
    } catch (err: any) {
      setError(err.message || 'Emergency routing failed');
      add?.('error', 'Routing failed', 'Could not compute emergency route');
    } finally {
      setLoading(false);
    }
  }, [source, destination, vehicleType, add]);

  if (loading && !result) {
    return <LoadingState message="Computing emergency route…" />;
  }
  if (error && !result) {
    return <ErrorState title="Routing failed" message={error} onRetry={fetchRoutes} />;
  }

  return (
    <div className="flex h-full w-full">
      {/* Left controls */}
      <aside className="w-80 bg-slate-900/95 backdrop-blur border-r border-slate-800 flex flex-col shrink-0 z-10">
        <div className="p-4 border-b border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Ambulance className="h-5 w-5 text-red-500" /> Emergency Routing
          </h2>
          <p className="text-xs text-slate-500 mt-1">Priority vehicle routing (simulation)</p>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <Select
            label="Vehicle type"
            value={vehicleType}
            onChange={(e) => setVehicleType(e.target.value as EmergencyVehicle)}
          >
            {VEHICLES.map((v) => (
              <option key={v.value} value={v.value}>
                {v.label}
              </option>
            ))}
          </Select>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Source</label>
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              {NODES.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Destination</label>
            <Select value={destination} onChange={(e) => setDestination(e.target.value)}>
              {NODES.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </Select>
          </div>

          <Button onClick={fetchRoutes} variant="primary" className="w-full" loading={loading}>
            <Play className="mr-2 h-4 w-4" /> Compute priority route
          </Button>

          {error && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="mt-4 p-3 rounded-lg bg-red-900/20 border border-red-500/30">
            <p className="text-[10px] text-red-300">
              <strong className="text-red-400">SIMULATION —</strong> for demonstration only. Does not pre-empt real signals or track real vehicles.
            </p>
          </div>
        </div>
      </aside>

      <div className="flex-1 relative min-w-0 flex flex-col">
        <MapView
          edges={[]}
          incidents={[]}
          routes={result ? [result.normal, result.emergency].filter(Boolean) : []}
        />

        <div className="h-1/3 border-t border-slate-800 p-4 overflow-y-auto">
          {!result ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 text-slate-500">
              <Info className="h-10 w-10 opacity-30 mb-3" />
              <p className="text-sm">Select source, destination &amp; vehicle type, then compute the priority route.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <StatCard title="Normal ETA" value={formatMinutes(result.normal.total_time_min)} />
                <StatCard title="Emergency ETA" value={formatMinutes(result.emergency.total_time_min)} trend={{ label: 'saved', value: result.emergency.time_saved_min, positive: true }} />
              </div>

              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4 text-red-400" />
                  <span className="font-medium text-red-300 text-sm">Estimated time saved</span>
                </div>
                <div className="text-2xl font-bold text-red-300">
                  {formatMinutes(result.emergency.time_saved_min ?? 0)}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">vs fastest normal route under current conditions.</p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between p-2 rounded bg-slate-800 border border-slate-700">
                  <span className="text-sm text-slate-300">Normal route</span>
                  <span className="text-sm font-mono text-slate-100">{formatMinutes(result.normal.total_time_min)}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded bg-red-900/20 border border-red-500/30">
                  <span className="text-sm text-red-300">Emergency route</span>
                  <span className="text-sm font-mono text-red-300">{formatMinutes(result.emergency.total_time_min)}</span>
                </div>
              </div>

              <p className="text-[10px] text-slate-500">
                Signal priority simulated at signalised junctions along the emergency path. Source: SIMULATION.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
