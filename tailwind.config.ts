import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        profundo: '#0E3A4D', // Atlántico Profundo — color principal de marca
        turba: '#14181B', // texto fuerte / monocromo
        hueso: '#F4F0E6', // fondo base
        niebla: '#9DAFB6', // apoyo, líneas, captions
        tussok: '#C1913A', // acento — máx. ~5% de la pieza, nunca como texto suelto
        linea: 'rgba(14,58,77,.14)', // borde sutil de tarjetas
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        archivo: ['var(--font-archivo)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
