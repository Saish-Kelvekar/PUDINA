import { SourceBadge } from '@/components/ui/Badge';

export function Legend({ showPredicted = false }: { showPredicted?: boolean }) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-panel">
      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Traffic legend</h3>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: 'Flowing', color: '#16a34a' },
          { label: 'Moderate', color: '#eab308' },
          { label: 'Heavy', color: '#f97316' },
          { label: 'Severe', color: '#dc2626' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-slate-300">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#94a3b8' }} />
          <span className="text-xs text-slate-300">No data</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-blue-600 bg-transparent rounded-full" />
          <span className="text-xs text-slate-300">Selected route</span>
        </div>
        {showPredicted && (
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-purple-600 bg-transparent rounded-full" />
            <span className="text-xs text-slate-300">Predicted (AI)</span>
          </div>
        )}
      </div>
      <div className="mt-3 pt-2 border-t border-slate-700">
        <SourceBadge source="SIMULATED" /> Simulated data
      </div>
    </div>
  );
}

export function IncidentLegend() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 shadow-panel mt-4">
      <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">Incident status</h3>
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-slate-300">Verified</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-500" />
          <span className="text-xs text-slate-300">Pending</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-slate-500" />
          <span className="text-xs text-slate-300">Resolved</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-xs text-slate-300">Rejected</span>
        </div>
      </div>
    </div>
  );
}
