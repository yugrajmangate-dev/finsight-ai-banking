/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        navy: { 950: '#06142B', 900: '#0B2545', 800: '#13315C', 700: '#1C4073' },
        brand: { 50: '#EEF5FF', 100: '#D9E8FF', 200: '#B6D2FF', 500: '#2F6FED', 600: '#1F5AD6', 700: '#1847AB' },
        ink: { 900: '#0F172A', 700: '#334155', 500: '#64748B', 300: '#CBD5E1', 100: '#F1F5F9' },
      },
      boxShadow: { card: '0 1px 2px rgba(15,23,42,.04), 0 1px 3px rgba(15,23,42,.06)' },
    },
  },
  plugins: [],
}
