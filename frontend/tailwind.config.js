/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
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
