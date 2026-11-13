/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        // Warm stone / cream surfaces
        sand: {
          50: '#FBF9F6',
          100: '#F5F1EB',
          200: '#EDE8E1',
          300: '#E2DACF',
          400: '#CFC4B6',
          500: '#B5A898',
        },
        // Charcoal text + dark surfaces
        ink: {
          DEFAULT: '#1F1D1B',
          soft: '#3A3632',
          muted: '#6B635A',
          faint: '#9A9087',
        },
        // Warm accent
        bronze: {
          light: '#C49A7A',
          DEFAULT: '#9A6B4F',
          dark: '#7A5038',
        },
        traffic: {
          green: '#5E8C61',
          yellow: '#D4A93C',
          orange: '#D07B3A',
          red: '#B8453A',
          grey: '#A39B92',
          blue: '#4A6A8A',
          purple: '#7E6A9A',
        },
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
        panel: '0 1px 2px rgb(60 45 30 / 0.04), 0 8px 24px -12px rgb(60 45 30 / 0.18)',
        panelHover: '0 2px 4px rgb(60 45 30 / 0.06), 0 18px 40px -16px rgb(60 45 30 / 0.28)',
        glass: '0 1px 0 rgb(255 255 255 / 0.6) inset, 0 20px 50px -20px rgb(60 45 30 / 0.35)',
        frame: '0 30px 80px -30px rgb(60 45 30 / 0.45)',
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
