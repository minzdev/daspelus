/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      spacing: {
        4.5: '1.125rem',
        5.5: '1.375rem',
      },
      opacity: {
        8: '0.08',
        12: '0.12',
        15: '0.15',
        35: '0.35',
        45: '0.45',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Biru navy pemerintahan (warna utama)
        navy: {
          50: '#F0F4FA',
          100: '#DCE6F3',
          200: '#B9CDE6',
          300: '#8BADD4',
          400: '#5A88BC',
          500: '#3A6BA3',
          600: '#2B5385',
          700: '#214269',
          800: '#16314E',
          900: '#0E2238',
          950: '#081627',
        },
        // Emas/amber aksen khas instansi pemerintah
        gold: {
          50: '#FDF8EC',
          100: '#F9EDD0',
          200: '#F2D99E',
          300: '#E9C166',
          400: '#DFA83C',
          500: '#C88F24',
          600: '#A6711C',
          700: '#7F5417',
          800: '#5C3C14',
          900: '#3F2A10',
        },
        surface: {
          DEFAULT: '#F4F6FA',
          card: '#FFFFFF',
          border: '#E3E8F0',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(14, 34, 56, 0.06), 0 4px 16px rgba(14, 34, 56, 0.06)',
        cardHover: '0 2px 4px rgba(14, 34, 56, 0.08), 0 8px 24px rgba(14, 34, 56, 0.10)',
        sidebar: '4px 0 24px rgba(8, 22, 39, 0.25)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-400px 0' },
          '100%': { backgroundPosition: '400px 0' },
        },
      },
      animation: {
        fadeUp: 'fadeUp 0.35s ease-out both',
        fadeIn: 'fadeIn 0.25s ease-out both',
      },
    },
  },
  plugins: [],
}
