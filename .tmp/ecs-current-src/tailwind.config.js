/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Noto Sans SC"', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Comfortaa', '"Noto Sans SC"', 'sans-serif'],
      },
      colors: {
        'remuse-dark': '#0f0f0f',
        'remuse-panel': '#1a1a1a',
        'remuse-border': '#333333',
        'remuse-accent': '#ccff00',
        'remuse-secondary': '#00ffff',
      },
      backgroundImage: {
        'grid-pattern':
          "linear-gradient(to right, #222 1px, transparent 1px), linear-gradient(to bottom, #222 1px, transparent 1px)",
      },
      animation: {
        'mosaic-flow': 'mosaicMove 10s linear infinite',
        'text-draw': 'textDraw 3s ease-out forwards',
        'expand-hall': 'expandHall 0.5s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'skeleton-pulse': 'skeletonPulse 1.8s ease-in-out infinite',
        'view-enter': 'viewEnter 0.35s cubic-bezier(0.22, 1, 0.36, 1) forwards',
        'milestone-pop': 'milestonePop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'confetti-fall': 'confettiFall 1.5s ease-out forwards',
      },
      keyframes: {
        mosaicMove: {
          '0%': { transform: 'translate(0, 0)' },
          '100%': { transform: 'translate(-20px, -20px)' },
        },
        textDraw: {
          '0%': { strokeDasharray: '50', strokeDashoffset: '50', fill: 'transparent' },
          '80%': { strokeDasharray: '50', strokeDashoffset: '0', fill: 'transparent' },
          '100%': { strokeDasharray: '50', strokeDashoffset: '0', fill: 'white' },
        },
        expandHall: {
          '0%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.1)', opacity: '0.8' },
          '100%': { transform: 'scale(3)', opacity: '0' },
        },
        skeletonPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        viewEnter: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        milestonePop: {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '70%': { opacity: '1', transform: 'scale(1.1)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        confettiFall: {
          '0%': { opacity: '1', transform: 'translateY(0) rotate(0deg)' },
          '100%': { opacity: '0', transform: 'translateY(120px) rotate(360deg)' },
        },
      },
    },
  },
  plugins: [],
};
