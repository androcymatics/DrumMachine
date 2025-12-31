/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'drum': {
          'bg': '#0a0a0f',
          'surface': '#12121a',
          'elevated': '#1a1a24',
          'border': '#2a2a3a',
          'accent': '#ff6b35',
          'accent-hover': '#ff8555',
          'secondary': '#00d4aa',
          'text': '#e8e8ec',
          'muted': '#8888a0'
        }
      },
      fontFamily: {
        'display': ['Instrument Sans', 'system-ui', 'sans-serif'],
        'mono': ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      boxShadow: {
        'glow': '0 0 20px rgba(255, 107, 53, 0.3)',
        'glow-sm': '0 0 10px rgba(255, 107, 53, 0.2)'
      }
    },
  },
  plugins: [],
}

