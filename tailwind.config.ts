import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#10312e',
        pill: { DEFAULT: '#0f766e', light: '#e6f3f2', dark: '#0b5e58' },
      },
    },
  },
  plugins: [],
};
export default config;
