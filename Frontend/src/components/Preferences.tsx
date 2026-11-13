import { Globe, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/lib/theme';
import { LANGUAGES, useLanguage, type Lang } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Light/dark toggle + language picker.
 * `onVideo` = the login page, where they sit on the dark video (always light-on-dark).
 */
export function Preferences({ onVideo = false, className }: { onVideo?: boolean; className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const { lang, setLang } = useLanguage();
  const isDay = theme === 'day';

  const pill = onVideo
    ? 'border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.08)] text-[#FFFFFF] backdrop-blur-md hover:bg-[rgba(255,255,255,0.16)]'
    : 'glass text-ink hover:text-bronze';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <label className={cn('relative flex h-10 items-center gap-1.5 rounded-full pl-3 pr-2 transition-colors', pill)}>
        <Globe className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="sr-only">Language</span>
        <select
          data-no-translate
          value={lang}
          onChange={(e) => setLang(e.target.value as Lang)}
          aria-label="Language"
          className="cursor-pointer appearance-none bg-transparent pr-1 text-xs font-semibold focus:outline-none"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code} className="bg-[#FFFFFF] text-[#1C1917]">
              {l.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={toggleTheme}
        aria-label={isDay ? 'Switch to dark mode' : 'Switch to light mode'}
        title={isDay ? 'Switch to dark mode' : 'Switch to light mode'}
        className={cn('flex h-10 w-10 items-center justify-center rounded-full transition-colors', pill)}
      >
        {isDay ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </button>
    </div>
  );
}
