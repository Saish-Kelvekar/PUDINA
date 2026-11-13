import { SourceBadge } from '@/components/ui/Badge';
import { CONGESTION_COLORS, statusColor } from '@/lib/colors';

export function Legend({ showPredicted = false }: { showPredicted?: boolean }) {
  const rows = [
    { label: 'Flowing', color: CONGESTION_COLORS.green },
    { label: 'Moderate', color: CONGESTION_COLORS.yellow },
    { label: 'Heavy', color: CONGESTION_COLORS.orange },
    { label: 'Severe', color: CONGESTION_COLORS.red },
    { label: 'No data', color: CONGESTION_COLORS.grey },
  ];
  return (
    <div className="rounded-3xl border border-white/80 bg-white/55 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="eyebrow">Traffic legend</h3>
        <SourceBadge source="SIMULATED" />
      </div>
      {/* gradient bar */}
      <div
        className="h-2 w-full rounded-full"
        style={{
          background: `linear-gradient(90deg, ${CONGESTION_COLORS.green}, ${CONGESTION_COLORS.yellow}, ${CONGESTION_COLORS.orange}, ${CONGESTION_COLORS.red})`,
        }}
      />
      <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
        {rows.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span className="h-1.5 w-5 rounded-full" style={{ backgroundColor: item.color }} />
            <span className="text-xs text-ink-soft">{item.label}</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-5 rounded-full border-2 border-ink bg-transparent" />
          <span className="text-xs text-ink-soft">Selected route</span>
        </div>
        {showPredicted && (
          <div className="flex items-center gap-2">
            <span className="h-0 w-5 border-t-2 border-dashed" style={{ borderColor: CONGESTION_COLORS.purple }} />
            <span className="text-xs text-ink-soft">Predicted (AI)</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function IncidentLegend() {
  return (
    <div className="rounded-3xl border border-white/80 bg-white/55 p-4">
      <h3 className="eyebrow mb-3">Incident status</h3>
      <div className="grid grid-cols-2 gap-2">
        {['verified', 'pending', 'resolved', 'rejected'].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: statusColor(s) }} />
            <span className="text-xs capitalize text-ink-soft">{s}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
