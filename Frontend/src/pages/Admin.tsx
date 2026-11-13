import { useState, useCallback, useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { apiClient } from '@/api/api';
import type { Incident } from '@/types';
import { LoadingState, ErrorState } from '@/components/ui/ErrorState';
import { isoToLocalTime, statusColor } from '@/lib/colors';
import { ShieldAlert, CheckCircle2, XCircle, MinusCircle, AlertTriangle, MapPin } from 'lucide-react';

export default function Admin() {
  const { add } = useToast() as any;
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [duplicates, setDuplicates] = useState<Array<{ id: string; incidents: Incident[]; score: number }>>([]);
  const [overview, setOverview] = useState<any>(null);
  const [impact, setImpact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'incidents' | 'duplicates' | 'impact'>('incidents');

  const fetchAdmin = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [incs, dups, ov] = await Promise.all([
        apiClient.getIncidents(),
        apiClient.getDuplicateCandidates(),
        apiClient.getAdminOverview(),
      ]);
      setIncidents(incs);
      setDuplicates(dups);
      setOverview(ov);
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

  const handleAction = async (id: number | string, status: string) => {
    try {
      await apiClient.updateIncidentStatus(id, status);
      setIncidents((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
      add?.('success', `Incident ${status}`, `Report #${id} marked as ${status}`);
      await fetchAdmin();
    } catch (err: any) {
      setError(err.message || `Failed to ${status} incident`);
    }
  };

  const handleImpact = async (inc: Incident) => {
    try {
      const res = await apiClient.getNetworkImpact(inc.lat, inc.lng);
      setImpact(res);
      setActiveTab('impact');
      add?.('success', 'Network impact', `Showing ${res.count} affected segments`);
    } catch (err: any) {
      setError(err.message || 'Impact analysis failed');
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
    <div className="flex h-full w-full">
      {/* Left: overview + incident list */}
      <aside className="w-80 bg-slate-900/95 backdrop-blur border-r border-slate-800 flex flex-col shrink-0 z-10">
        <div className="p-4 border-b border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-blue-400" /> Admin Dashboard
          </h2>
          <p className="text-xs text-slate-500 mt-1">Incident review &amp; verification</p>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          {overview && (
            <div className="grid grid-cols-2 gap-2">
              <StatCard title="Total incidents" value={overview.incidents?.total ?? incidents.length} />
              <StatCard title="Pending" value={overview.incidents?.pending ?? pending.length} trend={{ label: 'needs review', value: overview.incidents?.pending ?? pending.length, positive: false }} />
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Incident reports</label>
            <div className="flex gap-1">
              <button
                onClick={() => setActiveTab('incidents')}
                className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${
                  activeTab === 'incidents'
                    ? 'bg-blue-600/20 text-blue-300 border-blue-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-600 hover:text-white'
                }`}
              >
                All ({incidents.length})
              </button>
              <button
                onClick={() => setActiveTab('duplicates')}
                className={`flex-1 px-2 py-1.5 text-xs rounded border transition-colors ${
                  activeTab === 'duplicates'
                    ? 'bg-purple-600/20 text-purple-300 border-purple-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-600 hover:text-white'
                }`}
              >
                Duplicates ({duplicates.length})
              </button>
            </div>
          </div>

          {activeTab === 'impact' && impact && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 mb-4">
              <h4 className="text-xs font-semibold text-slate-300 mb-2">Network impact</h4>
              <p className="text-sm text-slate-200">{impact.count} affected segments</p>
              <p className="text-[10px] text-slate-500 mt-1">Simulated closure label applied.</p>
              <Button variant="ghost" size="sm" onClick={() => setActiveTab('incidents')} className="w-full mt-2">
                Back to incidents
              </Button>
            </div>
          )}

          {activeTab === 'duplicates' && (
            <div className="space-y-3">
              {duplicates.length === 0 ? (
                <p className="text-[10px] text-slate-500">No duplicate candidates detected.</p>
              ) : (
                duplicates.map((d) => (
                  <div key={d.id} className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-xs font-medium text-slate-300">Candidate #{d.id}</span>
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                        d.score > 0.8 ? 'bg-red-900/20 text-red-400 border-red-500/30' : 'bg-yellow-900/20 text-yellow-400 border-yellow-500/30'
                      }`}>
                        {Math.round(d.score * 100)}% match
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {d.incidents.map((inc) => (
                        <div key={inc.id} className="flex-1 border-r border-slate-700 pr-2 last:border-0">
                          <div className="text-[10px] text-slate-500">#{inc.id}</div>
                          <div className="text-xs text-slate-200 truncate">{inc.description}</div>
                          <div className="text-[10px] text-slate-500">{inc.status}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'incidents' && (
            <div className="space-y-2 max-h-[400] overflow-y-auto">
              {incidents.length === 0 ? (
                <p className="text-[10px] text-slate-500">No incidents reported.</p>
              ) : (
                incidents.map((inc) => (
                  <div key={inc.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800 border border-slate-700">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-slate-200 truncate">{inc.type}</div>
                      <div className="text-[10px] text-slate-500 truncate">{inc.description}</div>
                      <div className="text-[10px] text-slate-500">
                        {inc.reporter} · {isoToLocalTime(inc.created_at)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                        inc.status === 'verified' ? 'bg-green-900/20 text-green-400 border-green-500/30' :
                        inc.status === 'pending' ? 'bg-yellow-900/20 text-yellow-400 border-yellow-500/30' :
                        inc.status === 'resolved' ? 'bg-slate-900/20 text-slate-400 border-slate-600' :
                        'bg-red-900/20 text-red-400 border-red-500/30'
                      }`}>
                        {inc.status}
                      </span>
                      {inc.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleAction(inc.id, 'verified')}
                            className="p-1 text-green-400 hover:bg-green-500/10 rounded"
                            title="Verify"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleAction(inc.id, 'rejected')}
                            className="p-1 text-red-400 hover:bg-red-500/10 rounded"
                            title="Reject"
                          >
                            <XCircle className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => handleAction(inc.id, 'resolved')}
                            className="p-1 text-slate-400 hover:bg-slate-600/50 rounded"
                            title="Resolve"
                          >
                            <MinusCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </aside>

      <div className="flex-1 relative min-w-0 flex flex-col">
        <MapView
          edges={[]}
          incidents={activeTab === 'impact' ? [] : incidents}
          routes={[]}
        />

        <div className="h-1/3 border-t border-slate-800 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-red-400" /> Incidents on map
            </h3>
            <span className="text-xs text-slate-500">{incidents.length} reports</span>
          </div>
          <div className="space-y-2">
            {incidents.slice(0, 8).map((inc) => (
              <div key={inc.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-800 border border-slate-700 cursor-pointer hover:bg-slate-700 transition-colors"
                onClick={() => handleImpact(inc)}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: statusColor(inc.status) }} />
                  <div className="text-sm text-slate-200 truncate w-32">{inc.type}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-medium" style={{ color: statusColor(inc.status) }}>
                    {inc.status}
                  </div>
                  <div className="text-[10px] text-slate-500">{isoToLocalTime(inc.created_at)}</div>
                </div>
                <AlertTriangle className="h-4 w-4 text-slate-500 opacity-50" />
              </div>
            ))}
            {incidents.length > 8 && (
              <div className="p-2 text-center text-[10px] text-slate-500">
                Showing 8 of {incidents.length}. Click a row to view network impact.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
