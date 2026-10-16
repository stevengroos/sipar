/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class', // <--- ¡ESTA ES LA LÍNEA MÁGICA!
  theme: {
    extend: {
      colors: {
        sipar: {
          dark: '#1E232D',
          orange: '#FF9E00',
          light: '#F8F9FA',
          gray: '#8E8E93',
          border: '#E5E7EB'
        }
      }
    }
  },
  plugins: [],
}