/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        canvas: '#060B16',
        surface: '#0B1220',
        panel: '#111C30',
        elevated: '#18243B',
      },
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
};
