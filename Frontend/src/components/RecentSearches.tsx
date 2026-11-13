import { useCallback, useEffect, useState } from 'react';
import { History, Eye, RotateCcw, Trash2, CheckCircle2, CircleDot } from 'lucide-react';
import { apiClient } from '@/api/api';
import type { RouteHistoryItem } from '@/types';
import { formatETA } from '@/lib/colors';
import { cn, istDateTime } from '@/lib/utils';

interface Props {
  /** Change this number to reload the list (after a compare, a choice or a delete elsewhere). */
  refreshKey: number;
  /** The search currently shown on the map, highlighted in the list. */
  activeId?: number | null;
  onView: (item: RouteHistoryItem) => void;
  onSearchAgain: (item: RouteHistoryItem) => void;
  /** Called after a search is deleted (so the page can clear it if it was on screen). */
  onDeleted?: (id: number | 'all') => void;
}

const PAGE = 8;

/** The logged-in user's recent route searches, with the route they chose. */
export function RecentSearches({ refreshKey, activeId, onView, onSearchAgain, onDeleted }: Props) {
  const [items, setItems] = useState<RouteHistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const page = await apiClient.getRouteHistory(limit);
      setItems(page.items);
      setTotal(page.total);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Could not load your searches');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const remove = async (id: number) => {
    try {
      await apiClient.deleteSearch(id);
      onDeleted?.(id);
      load();
    } catch (err: any) {
      setError(err.message || 'Could not delete');
    }
  };

  const clearAll = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      setTimeout(() => setConfirmClear(false), 4000);
      return;
    }
    setConfirmClear(false);
    try {
      await apiClient.clearRouteHistory();
      onDeleted?.('all');
      load();
    } catch (err: any) {
      setError(err.message || 'Could not clear history');
    }
  };

  return (
    <section className="space-y-3 rounded-3xl border border-white/80 bg-white/50 p-4" aria-label="Recent searches">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-muted">
          <History className="h-3.5 w-3.5" /> Recent searches {total > 0 && <span className="text-ink-faint">· {total}</span>}
        </p>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className={cn('rounded-full px-2 py-1 text-[11px]', confirmClear ? 'bg-traffic-red/15 font-semibold text-traffic-red' : 'text-ink-faint hover:text-ink')}
          >
            {confirmClear ? 'Tap again to clear all' : 'Clear all'}
          </button>
        )}
      </div>

      {error && <p className="rounded-2xl bg-traffic-red/10 px-3 py-2 text-xs text-traffic-red">{error}</p>}

      {loading && items.length === 0 ? (
        <p className="px-1 text-xs text-ink-faint">Loading…</p>
      ) : items.length === 0 ? (
        <p className="px-1 text-xs text-ink-faint">No searches yet. Compare routes and they appear here.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li
              key={i.id}
              className={cn(
                'rounded-2xl border px-3 py-2.5 text-xs transition-colors',
                activeId === i.id ? 'border-bronze/50 bg-white/90' : 'border-white/70 bg-white/60',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 font-medium leading-snug text-ink">
                  <span className="block truncate" title={i.source.name}>{i.source.name}</span>
                  <span className="block truncate text-ink-muted" title={i.destination.name}>→ {i.destination.name}</span>
                </p>
                <span className="shrink-0 text-[10px] text-ink-faint">{istDateTime(i.created_at)}</span>
              </div>

              <div className="mt-1.5 space-y-0.5 text-[11px] text-ink-muted">
                {i.recommended && (
                  <p className="flex items-start gap-1">
                    <CircleDot className="mt-0.5 h-3 w-3 shrink-0 text-bronze" />
                    <span>Recommended: {i.recommended.label} · {formatETA(i.recommended.eta_min)}</span>
                  </p>
                )}
                {i.chosen ? (
                  <p className="flex items-start gap-1 font-medium text-ink">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-traffic-green" />
                    <span>
                      Used: {i.chosen.label} · {formatETA(i.chosen.eta_min)}{' '}
                      <span className="font-normal text-ink-faint">
                        {i.chosen.followed_recommendation ? '· as recommended' : '· own choice'}
                      </span>
                    </span>
                  </p>
                ) : (
                  <p className="text-ink-faint">No route chosen</p>
                )}
              </div>

              <div className="mt-2 flex items-center gap-1.5">
                <button type="button" onClick={() => onView(i)} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] text-ink hover:bg-sand-100">
                  <Eye className="h-3 w-3" /> View
                </button>
                <button type="button" onClick={() => onSearchAgain(i)} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] text-ink hover:bg-sand-100" title="Calculate again with the current traffic">
                  <RotateCcw className="h-3 w-3" /> Search again
                </button>
                <button
                  type="button"
                  onClick={() => remove(i.id)}
                  className="ml-auto flex h-7 w-7 items-center justify-center rounded-full text-ink-faint hover:bg-white hover:text-traffic-red"
                  aria-label={`Delete search ${i.source.name} to ${i.destination.name}`}
                  title="Delete from history"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {total > items.length && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="w-full rounded-full py-1.5 text-[11px] text-bronze hover:text-bronze-dark">
          Show more ({total - items.length} older)
        </button>
      )}
    </section>
  );
}
