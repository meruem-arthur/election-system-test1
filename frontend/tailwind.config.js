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
          DEFAULT: '#00ff88',
          50: '#f0fff8',
          100: '#ccffec',
          200: '#99ffd9',
          300: '#66ffc6',
          400: '#33ffb3',
          500: '#00ff88',
          600: '#00cc6a',
          700: '#00994f',
          800: '#006635',
          900: '#00331a',
        },
        dark: {
          DEFAULT: '#0a0a0a',
          100: '#0f0f0f',
          200: '#141414',
          300: '#1a1a1a',
          400: '#222222',
          500: '#2a2a2a',
          600: '#333333',
          700: '#444444',
          800: '#555555',
          900: '#777777',
        }
      },
      fontFamily: {
        display: ['var(--font-orbitron)', 'monospace'],
        body: ['var(--font-syne)', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace'],
      },
      backgroundImage: {
        'grid-pattern': 'linear-gradient(rgba(0,255,136,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,136,0.03) 1px, transparent 1px)',
        'glow-radial': 'radial-gradient(ellipse at center, rgba(0,255,136,0.15) 0%, transparent 70%)',
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
      boxShadow: {
        'glow': '0 0 20px rgba(0,255,136,0.3)',
        'glow-lg': '0 0 40px rgba(0,255,136,0.2)',
        'glow-sm': '0 0 10px rgba(0,255,136,0.4)',
        'inner-glow': 'inset 0 0 20px rgba(0,255,136,0.1)',
      },
      animation: {
        'pulse-glow': 'pulse-glow 2s ease-in-out infinite',
        'scan-line': 'scan-line 3s linear infinite',
        'counter-up': 'counter-up 0.5s ease-out',
        'slide-in': 'slide-in 0.3s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
      },
      keyframes: {
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0,255,136,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0,255,136,0.6)' },
        },
        'scan-line': {
          '0%': { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
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
