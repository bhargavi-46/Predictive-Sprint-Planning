/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Mirrors the palette used in the project presentation.
        navy: {
          DEFAULT: '#122842',
          mid: '#2c5078',
          light: '#3d6b9c',
        },
        teal: {
          DEFAULT: '#238c87',
          light: '#e6f4f3',
        },
        rust: '#aa552d',
        paper: '#f2f5f8',
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
