/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fef7f6',
          100: '#fde8e6',
          200: '#fbd5d1',
          300: '#f7b1ab',
          400: '#f08377',
          500: '#db4c3f',
          600: '#c53727',
          700: '#a62d20',
          800: '#89281e',
          900: '#72261f',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
