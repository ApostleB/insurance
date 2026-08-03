/* Tailwind Play CDN 설정 (CSP상 인라인 스크립트를 피하기 위해 외부 파일로 분리) */
tailwind.config = {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        mint: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
        },
        kakao: '#FEE500',
      },
      boxShadow: {
        glow: '0 10px 25px -5px rgba(37, 99, 235, 0.25)',
        card: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        float: '0 -4px 20px rgba(0, 0, 0, 0.08)',
      },
      fontFamily: {
        sans: [
          'Pretendard',
          '-apple-system',
          'BlinkMacSystemFont',
          'Apple SD Gothic Neo',
          'Noto Sans KR',
          'Malgun Gothic',
          'sans-serif',
        ],
      },
    },
  },
};
