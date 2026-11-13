interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { label: string; value: number; positive: boolean };
  icon?: React.ReactNode;
}

export function StatCard({ title, value, subtitle, trend, icon }: StatCardProps) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-slate-400">{icon}</span>}
          <h3 className="text-xs font-medium text-slate-400">{title}</h3>
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trend.positive ? 'text-green-400' : 'text-red-400'}`}>
            {trend.label}: {trend.value > 0 ? '+' : ''}{trend.value}
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold text-slate-100">{value}</div>
      {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
    </div>
  );
}
