import type { Config } from 'tailwindcss';
import { tailwindThemeColors } from './src/shared/lib/colors';

// Paleta propia (Req. 15.2, 15.7, 15.14): los valores se definen una sola vez en src/shared/lib/colors.ts.
// Clases disponibles: bg-page, text-ink, text-muted, bg-primary, text-heading, bg-active, bg-danger,
// border-border, bg-status-<tono>-bg / text-status-<tono>-fg y bg-event-e1 … e7.
const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: tailwindThemeColors(),
      transitionDuration: {
        DEFAULT: '200ms',
      },
    },
  },
  plugins: [],
};

export default config;
