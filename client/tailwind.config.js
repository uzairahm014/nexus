/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        void: '#05040F',
        midnight: '#08061F',
        navy: '#0C0A2A',
        indigo: '#1A1258',
        violet: '#4D37C7',
        neon: '#7C3AED',
        magenta: '#9D47DF',
        cyan: '#22D3EE',
        ink: '#E9E7FF',
        muted: '#9C97C4',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        sans: ['Inter', 'system-ui', '-apple-system', '"SF Pro Text"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 40px -12px rgba(124,58,237,0.65)',
        cyan: '0 0 40px -14px rgba(34,211,238,0.55)',
        card: '0 24px 60px -30px rgba(3,2,12,0.95)',
      },
      backgroundImage: {
        'nexus-grid':
          'linear-gradient(rgba(124,58,237,0.09) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.09) 1px, transparent 1px)',
        'nexus-radial':
          'radial-gradient(120% 90% at 15% 0%, rgba(77,55,199,0.42) 0%, rgba(8,6,31,0) 60%), radial-gradient(80% 70% at 100% 10%, rgba(157,71,223,0.30) 0%, rgba(8,6,31,0) 55%)',
      },
      animation: {
        'float-slow': 'float 12s ease-in-out infinite',
        'pulse-glow': 'pulseGlow 3.6s ease-in-out infinite',
        'fade-up': 'fadeUp 0.5s cubic-bezier(0.22,1,0.36,1) both',
        marquee: 'marquee 32s linear infinite',
        shimmer: 'shimmer 1.8s linear infinite',
      },
      keyframes: {
        float: {
          '0%,100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(0,-14px,0)' },
        },
        pulseGlow: {
          '0%,100%': { opacity: '0.55' },
          '50%': { opacity: '1' },
        },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to: { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};
