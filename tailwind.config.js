/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        'mist-pink': {
          50: '#FEF6F6',
          100: '#FCEEED',
          200: '#F2D7D9',
          300: '#E8C4C4',
          400: '#D4A5A5',
          500: '#B88585',
          600: '#9E6B6B',
          700: '#7A5C5C',
          800: '#5C4033',
          900: '#3D2A22'
        },
        'cream': {
          50: '#FFFBF7',
          100: '#FDF8F5',
          200: '#F5E6D3'
        }
      },
      fontFamily: {
        cute: ['"ZCOOL KuaiLe"', '"Ma Shan Zheng"', 'system-ui', 'sans-serif']
      },
      boxShadow: {
        'soft': '0 4px 20px rgba(232, 196, 196, 0.3)',
        'softer': '0 2px 10px rgba(232, 196, 196, 0.2)'
      },
      borderRadius: {
        'card': '16px',
        'button': '12px',
        'input': '12px'
      },
      animation: {
        'bounce-slow': 'bounce 3s infinite',
        'heartbeat': 'heartbeat 1.5s ease-in-out infinite',
        'fade-in': 'fadeIn 0.3s ease-out'
      },
      keyframes: {
        heartbeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.1)' }
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: []
}
