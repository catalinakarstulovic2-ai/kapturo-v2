/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Tight', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        // ── NUEVO SISTEMA ─────────────────────────────────
        // Acento ámbar — Kapturo
        kap: {
          50:  '#FFF6E6',
          100: '#FFE8B8',
          300: '#FFC04D',
          500: '#F59E0B',
          600: '#D97706',
          700: '#92400E',
          900: '#3D1E04',
        },
        // Neutros grafito tibio
        ink: {
          0: '#FFFFFF',
          1: '#F9F7F4',
          2: '#F1EDE8',
          3: '#E5DED6',
          4: '#C9BFB4',
          5: '#9C9189',
          6: '#6E6560',
          7: '#3D3833',
          8: '#221E1B',
          9: '#0F0D0B',
        },
        // Estados semánticos
        ok:   { DEFAULT: '#16A34A', light: '#F0FDF4', border: '#BBF7D0' },
        warn: { DEFAULT: '#D97706', light: '#FFFBEB', border: '#FDE68A' },
        bad:  { DEFAULT: '#DC2626', light: '#FEF2F2', border: '#FECACA' },
        info: { DEFAULT: '#2563EB', light: '#EFF6FF', border: '#BFDBFE' },

        // ── SISTEMA ANTERIOR (se mantiene mientras se migra) ──
        // Primario — Violeta Kapturo
        brand: {
          50:  '#F5F3FF',
          100: '#EDE9FE',
          200: '#DDD6FE',
          300: '#C4B5FD',
          400: '#A78BFA',
          500: '#8B5CF6',
          600: '#7C3AED',
          700: '#6D28D9',
          800: '#5B21B6',
          900: '#4C1D95',
        },
        // Acento — Magenta Kapturo
        accent: {
          50:  '#FFF0F9',
          100: '#FFD6F1',
          200: '#FFAEE3',
          300: '#FF80D0',
          400: '#F050BC',
          500: '#D946A8',
          600: '#B8299A',
          700: '#92177C',
          800: '#6F1060',
          900: '#4F0945',
        },
      },
      keyframes: {
        'slide-up': {
          from: { transform: 'translateY(100%)' },
          to:   { transform: 'translateY(0)' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
}
