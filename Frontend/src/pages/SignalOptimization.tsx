import { useState, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { MapView } from '@/components/MapView';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

import { apiClient } from '@/api/api';
import type { SignalResult } from '@/types';
import { LoadingState, ErrorState } from '@/components/ui/ErrorState';
import { formatMinutes } from '@/lib/colors';
import { Signal, Play } from '@/icons';

const DEFAULT_APPROACHES = [
  { name: 'North', vehicle_density: 35, queue_length: 12, lanes: 2 },
  { name: 'South', vehicle_density: 28, queue_length: 9, lanes: 2 },
  { name: 'East', vehicle_density: 42, queue_length: 16, lanes: 2 },
  { name: 'West', vehicle_density: 20, queue_length: 6, lanes: 2 },
];

export default function SignalOptimization() {
  const { add } = useToast() as any;
  const [approaches, setApproaches] = useState<Array<{ name: string; vehicle_density: number; queue_length: number; lanes: number }>>(DEFAULT_APPROACHES);
  const [currentCycle, setCurrentCycle] = useState(90);

  const [result, setResult] = useState<SignalResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchOptimize = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.optimizeSignals(approaches, currentCycle);
      setResult(res);
      add?.('success', 'Signal optimized', 'New timing plan computed');
    } catch (err: any) {
      setError(err.message || 'Optimization failed');
      add?.('error', 'Optimization failed', 'Could not compute signal timings');
    } finally {
      setLoading(false);
    }
  }, [approaches, currentCycle, add]);

  const updateApproach = (index: number, field: string, value: string) => {
    const next = approaches.map((a, i) => (i === index ? { ...a, [field]: value === '' ? 0 : parseFloat(value) } : a));
    setApproaches(next);
    setResult(null);
  };

  if (loading && !result) {
    return <LoadingState message="Optimising signal timings…" />;
  }
  if (error && !result) {
    return <ErrorState title="Optimization failed" message={error} onRetry={fetchOptimize} />;
  }

  return (
    <div className="flex h-full w-full">
      {/* Left: inputs */}
      <aside className="w-80 bg-slate-900/95 backdrop-blur border-r border-slate-800 flex flex-col shrink-0 z-10">
        <div className="p-4 border-b border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Signal className="h-5 w-5 text-blue-400" /> Signal Optimization
          </h2>
          <p className="text-xs text-slate-500 mt-1">Adaptive timing simulation</p>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Current cycle length (sec)</label>
            <Input
              type="number"
              value={currentCycle}
              onChange={(e) => setCurrentCycle(parseInt(e.target.value) || 90)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Approaches</label>
            <p className="text-[10px] text-slate-500">Set density, queue &amp; lanes per approach</p>
            {approaches.map((ap, i) => (
              <div key={i} className="bg-slate-800 border border-slate-700 rounded-lg p-2.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-300">{ap.name}</span>
                  <button
                    onClick={() => setApproaches(approaches.filter((_, idx) => idx !== i))}
                    className="text-slate-500 hover:text-red-400"
                    title="Remove"
                  >
                    ×
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    label="Density"
                    type="number"
                    value={ap.vehicle_density}
                    onChange={(e) => updateApproach(i, 'vehicle_density', e.target.value)}
                    className="px-2 py-1.5 text-xs"
                  />
                  <Input
                    label="Queue"
                    type="number"
                    value={ap.queue_length}
                    onChange={(e) => updateApproach(i, 'queue_length', e.target.value)}
                    className="px-2 py-1.5 text-xs"
                  />
                  <Input
                    label="Lanes"
                    type="number"
                    value={ap.lanes}
                    onChange={(e) => updateApproach(i, 'lanes', e.target.value)}
                    className="px-2 py-1.5 text-xs"
                  />
                </div>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={() => setApproaches([...approaches, { name: `Approach ${approaches.length + 1}`, vehicle_density: 20, queue_length: 8, lanes: 1 }])}>
              + Add approach
            </Button>
          </div>

          <Button onClick={fetchOptimize} variant="primary" className="w-full" loading={loading}>
            <Play className="mr-2 h-4 w-4" /> Compute optimized timings
          </Button>

          {error && (
            <div className="p-3 rounded-lg bg-red-900/20 border border-red-500/30 text-sm text-red-300">
              {error}
            </div>
          )}

          <div className="mt-3 p-3 rounded-lg bg-slate-800 border border-slate-700">
            <p className="text-[10px] text-slate-400">
              Simulation only — does not control real traffic lights. Uses Webster&rsquo;s method with queue-based splits.
            </p>
          </div>
        </div>
      </aside>

      {/* Right: results */}
      <div className="flex-1 relative min-w-0 flex flex-col">
        <MapView edges={[]} incidents={[]} routes={[]} />

        <div className="h-1/2 border-t border-slate-800 p-4 overflow-y-auto">
          {!result ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 text-slate-500">
              <Signal className="h-10 w-10 opacity-30 mb-3" />
              <p className="text-sm">Configure approaches and compute optimised signal timings.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-2">
                <StatCard title="Current cycle" value={`${result.current_cycle_sec}s`} />
                <StatCard title="Optimised cycle" value={`${result.optimized_cycle_sec}s`} trend={{ label: 'lost time', value: result.total_lost_time_sec, positive: false }} />
                <StatCard title="Avg wait before" value={formatMinutes(result.summary.avg_wait_before_sec)} />
                <StatCard title="Avg wait after" value={formatMinutes(result.summary.avg_wait_after_sec)} trend={{ label: 'improvement', value: result.summary.total_improvement_pct, positive: true }} />
              </div>

              <div className="bg-slate-800 border border-slate-700 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Phase-by-phase comparison</h4>
                <div className="space-y-2">
                  {result.phases.map((p, i) => (
                    <div key={i} className="border-b border-slate-700 pb-2 last:border-0">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-slate-200">{p.approach}</span>
                        <span className="text-[10px] text-slate-500 font-mono">{p.improvement_pct}% improvement</span>
                      </div>
                      <div className="grid grid-cols-4 gap-2 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-500">Current green</div>
                          <div className="text-slate-300 font-mono">{p.current_green_sec}s</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Optimised green</div>
                          <div className="text-slate-300 font-mono">{p.optimized_green_sec}s</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Current wait</div>
                          <div className="text-slate-300 font-mono">{p.current_wait_sec}s</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500">Optimised wait</div>
                          <div className="text-slate-300 font-mono">{p.optimized_wait_sec}s</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                <h4 className="text-xs font-semibold text-green-300 uppercase tracking-wider mb-2">Result</h4>
                <p className="text-sm text-slate-200">
                  Optimising signal splits reduces average waiting time by{' '}
                  <span className="font-medium text-green-400">{result.summary.total_improvement_pct}%</span>{'&nbsp;'}
                  and improves estimated throughput by{' '}
                  <span className="font-medium text-green-400">{result.summary.throughput_increase_pct}%</span>.
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Green time is distributed in proportion to approach volume (Webster&rsquo;s method).</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
