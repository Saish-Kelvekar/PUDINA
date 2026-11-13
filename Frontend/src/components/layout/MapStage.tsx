import { cn } from '@/lib/utils';

interface MapStageProps {
  /** The full-bleed map (or other hero visual). */
  map: React.ReactNode;
  /** Floating glass control panel. */
  panel: React.ReactNode;
  /** Optional floating content anchored to the bottom of the stage (results, stats). */
  bottom?: React.ReactNode;
  /** Optional elements positioned absolutely over the map (chips, buttons). */
  overlay?: React.ReactNode;
  /** Height class for the bottom area on desktop. */
  bottomClassName?: string;
}

/**
 * Hero-style page: map fills the frame, a frosted panel floats on the left and
 * optional results float along the bottom. On narrow screens it stacks:
 * map on top, then panel, then results.
 */
export function MapStage({ map, panel, bottom, overlay, bottomClassName }: MapStageProps) {
  return (
    <div className="map-stage relative h-full w-full overflow-y-auto lg:overflow-hidden">
      {/* Map layer */}
      <div className="relative h-[52vh] min-h-[320px] lg:absolute lg:inset-0 lg:h-auto">
        {map}
        {/* warm wash so glass panels read well over the tiles */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-[1] hidden w-[42%] bg-gradient-to-r from-sand-200/70 via-sand-200/25 to-transparent lg:block" />
        {overlay}
      </div>

      {/* Panel */}
      <aside className="relative z-10 p-3 lg:absolute lg:bottom-4 lg:left-4 lg:top-4 lg:w-[360px] lg:p-0">
        <div className="glass flex h-full flex-col overflow-hidden rounded-4xl">
          <div className="flex-1 space-y-5 overflow-y-auto p-6">{panel}</div>
        </div>
      </aside>

      {/* Bottom results */}
      {bottom && (
        <div
          className={cn(
            'relative z-10 p-3 pt-0 lg:absolute lg:bottom-4 lg:left-[392px] lg:right-4 lg:p-0',
            bottomClassName,
          )}
        >
          {bottom}
        </div>
      )}
    </div>
  );
}

/** Chip-style floating label for map overlays. */
export function MapChip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'glass-strong flex items-center gap-2 rounded-full px-4 py-2 text-xs font-medium text-ink-soft',
        className,
      )}
    >
      {children}
    </div>
  );
}
