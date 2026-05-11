/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#b44fff',
          50: '#faf0ff',
          100: '#f0d6ff',
          200: '#e0adff',
          300: '#cc7fff',
          400: '#b44fff',
          500: '#9b2dff',
          600: '#7a0fd4',
          700: '#5c09a0',
          800: '#3d056b',
          900: '#1f0238',
        },
        gold: {
          DEFAULT: '#f5c842',
          100: '#fff8dc',
          200: '#ffec99',
          300: '#f5d860',
          400: '#f5c842',
          500: '#e6b020',
          600: '#c49010',
          700: '#9a6e08',
          800: '#6b4c04',
          900: '#3d2b01',
        },
        dark: {
          DEFAULT: '#06060f',
          100: '#0a0a1a',
          200: '#0d0d22',
          300: '#111130',
          400: '#16163a',
          500: '#1e1e4a',
          600: '#2a2a5e',
          700: '#3a3a7a',
          800: '#555590',
          900: '#7777aa',
        }
      },
      fontFamily: {
        display: ['var(--font-orbitron)', 'monospace'],
        body: ['var(--font-syne)', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(180,79,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(180,79,255,0.04) 1px, transparent 1px)',
        'glow-radial': 'radial-gradient(ellipse at center, rgba(120,30,200,0.25) 0%, rgba(10,5,40,0.8) 60%, transparent 100%)',
        'gold-radial': 'radial-gradient(ellipse at top, rgba(245,200,66,0.08) 0%, transparent 60%)',
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(180,79,255,0.4)',
        'glow-lg': '0 0 50px rgba(180,79,255,0.25)',
        'glow-sm': '0 0 10px rgba(180,79,255,0.5)',
        'gold-glow': '0 0 20px rgba(245,200,66,0.4)',
        'gold-glow-lg': '0 0 40px rgba(245,200,66,0.2)',
        'inner-glow': 'inset 0 0 20px rgba(180,79,255,0.1)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2.5s ease-in-out infinite',
        'scan-line': 'scan-line 3s linear infinite',
        'float': 'float 6s ease-in-out infinite',
        'slide-in': 'slide-in 0.3s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
        'shimmer': 'shimmer 3s linear infinite',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(180,79,255,0.3)' },
          '50%': { boxShadow: '0 0 50px rgba(180,79,255,0.7), 0 0 80px rgba(245,200,66,0.2)' },
        },
        'float': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'shimmer': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'slide-in': {
          '0%': { transform: 'translateX(-20px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        }
      }
    },
  },
  plugins: [],
}
