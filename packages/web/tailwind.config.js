/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // The brand colour, from CSS variables in index.css so it can be
        // changed (or themed) in one place. Use these classes, never hex.
        primary: Object.fromEntries(
          [50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((step) => [
            step,
            `rgb(var(--color-primary-${step}) / <alpha-value>)`,
          ]),
        ),
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
