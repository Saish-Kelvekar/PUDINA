import { fileURLToPath } from 'node:url';

// Point Tailwind at its config by full path, so the site styles correctly no matter
// which folder the dev server is started from (e.g. by start.ps1).
export default {
  plugins: {
    tailwindcss: { config: fileURLToPath(new URL('./tailwind.config.js', import.meta.url)) },
    autoprefixer: {},
  },
};
