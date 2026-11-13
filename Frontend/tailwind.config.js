/** @type {import('tailwindcss').Config} */
export default {
  // relative: true = these paths are relative to this file, not to the folder the server was started from
  content: {
    relative: true,
    files: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  },
  theme: {
    extend: {
      // Colours come from CSS variables (src/index.css), so one class works in both scopes:
      // the dark app (default) and light surfaces such as the login card (.theme-light).
      colors: {
        sand: {
          50: 'rgb(var(--tv-sand-50) / <alpha-value>)',
          100: 'rgb(var(--tv-sand-100) / <alpha-value>)',
          200: 'rgb(var(--tv-sand-200) / <alpha-value>)',
          300: 'rgb(var(--tv-sand-300) / <alpha-value>)',
          400: 'rgb(var(--tv-sand-400) / <alpha-value>)',
          500: 'rgb(var(--tv-sand-500) / <alpha-value>)',
        },
        ink: {
          DEFAULT: 'rgb(var(--tv-ink) / <alpha-value>)',
          soft: 'rgb(var(--tv-ink-soft) / <alpha-value>)',
          muted: 'rgb(var(--tv-ink-muted) / <alpha-value>)',
          faint: 'rgb(var(--tv-ink-faint) / <alpha-value>)',
        },
        // Accent: Traffic Amber
        bronze: {
          light: 'rgb(var(--tv-accent-light) / <alpha-value>)',
          DEFAULT: 'rgb(var(--tv-accent) / <alpha-value>)',
          dark: 'rgb(var(--tv-accent-dark) / <alpha-value>)',
        },
        traffic: {
          green: '#2A8E7E', // Signal Teal
          yellow: '#E3A034', // Traffic Amber
          orange: '#E07B39',
          red: '#E0604F',
          grey: '#8F8882',
          blue: '#6A8FB8',
          purple: '#9D88C2',
        },
      },
      // White surfaces and edges become translucent on the dark canvas
      // (bg-white/55 -> ~8%, border-white/80 -> ~15%). Text stays real white.
      backgroundColor: {
        white: 'rgb(255 255 255 / calc(<alpha-value> * var(--tv-white-bg, 1)))',
      },
      borderColor: {
        white: 'rgb(255 255 255 / calc(<alpha-value> * var(--tv-white-border, 1)))',
      },
      fontFamily: {
        sans: ['Manrope', 'Inter', 'system-ui', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'Times New Roman', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        '4xl': '2rem',
        '5xl': '2.5rem',
      },
      boxShadow: {
        panel: '0 1px 2px rgb(0 0 0 / 0.2), 0 8px 24px -12px rgb(0 0 0 / 0.45)',
        panelHover: '0 2px 4px rgb(0 0 0 / 0.25), 0 18px 40px -16px rgb(0 0 0 / 0.55)',
        glass: '0 1px 0 rgb(255 255 255 / 0.06) inset, 0 20px 50px -20px rgb(0 0 0 / 0.6)',
        frame: '0 30px 80px -30px rgb(0 0 0 / 0.7)',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out both',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
