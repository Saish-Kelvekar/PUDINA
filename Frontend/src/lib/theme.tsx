import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

/** 'night' = espresso / amber / teal (default). 'day' = the original warm cream theme. */
export type Theme = 'night' | 'day';

const KEY = 'tv_theme';

export function readSavedTheme(): Theme {
  try {
    return localStorage.getItem(KEY) === 'day' ? 'day' : 'night';
  } catch {
    return 'night';
  }
}

/** The CSS colour variables live in index.css; this only flips the class on <html>. */
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle('theme-day', theme === 'day');
  root.style.colorScheme = theme === 'day' ? 'light' : 'dark';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'day' ? '#EDE8E1' : '#14110E');
}

interface ThemeValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeValue>({ theme: 'night', toggleTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readSavedTheme);

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(KEY, theme);
    } catch {
      /* private mode: just don't remember */
    }
  }, [theme]);

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'day' ? 'night' : 'day')), []);
  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);

/**
 * Colours that are drawn by JavaScript (charts, map canvas), where CSS variables don't reach.
 * Traffic / route / status colours are the same in both themes.
 */
export function themeColors(theme: Theme) {
  if (theme === 'day') {
    return {
      chartMain: '#1F1D1B',
      chartAccent: '#C49A7A',
      chartPeak: '#9A6B4F',
      chartGrid: '#CFC4B6',
      chartTick: '#6B635A',
      chartCursor: 'rgba(154,107,79,0.08)',
      pie: ['#1F1D1B', '#9A6B4F', '#C49A7A', '#5E8C61', '#D4A93C', '#7E6A9A', '#4A6A8A'],
      tiles: 'Light',
      networkLine: '#8A8178',
      networkOpacity: 0.35,
      outline: '#9A6B4F',
      routeShadow: '#1F1D1B',
      routeShadowOpacity: 0.16,
      pinBg: '#1F1D1B',
      pinFg: '#FBF9F6',
      pinBorder: '#FBF9F6',
      closedRoad: '#1F1D1B',
    };
  }
  return {
    chartMain: '#E9E4DE',
    chartAccent: '#E3A034',
    chartPeak: '#E3A034',
    chartGrid: 'rgba(255,255,255,0.1)',
    chartTick: '#B3ADA8',
    chartCursor: 'rgba(227,160,52,0.08)',
    pie: ['#E9E4DE', '#E3A034', '#2A8E7E', '#F0BE6A', '#9D88C2', '#6A8FB8', '#5FBFAE'],
    tiles: 'Dark',
    networkLine: '#B3ADA8',
    networkOpacity: 0.22,
    outline: '#E3A034',
    routeShadow: '#000000',
    routeShadowOpacity: 0.4,
    pinBg: '#FFFFFF',
    pinFg: '#14110E',
    pinBorder: '#14110E',
    closedRoad: '#FFFFFF',
  };
}

export const useThemeColors = () => themeColors(useTheme().theme);
