/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],

    
	theme: {
		extend: {
			fontSize: {
				sm: '0.8rem',
				base: '1rem',
				xl: '1.25rem',
				'2xl': '1.563rem',
				'3xl': '1.953rem',
				'4xl': '2.441rem',
				'5xl': '3.052rem',
				'6xl': '5.352rem',
				'7xl': '7.625rem',
				'8xl': '8.25rem',
				'9xl': '11.25rem',
			}, colors: {
        primary: '#4F46E5', // Indigo for buttons
        secondary: '#059669', // Green for checkout
        accent: '#6B7280' // Gray for neutral elements
      }
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			animation: {
				marquee: 'marquee var(--duration) linear infinite',
				'marquee-vertical': 'marquee-vertical var(--duration) linear infinite',
				aurora: 'aurora 60s linear infinite', // 👈 added
				'fade-in': 'fade-in 0.15s ease-out',
				'scale-in': 'scale-in 0.15s ease-out',
			},
			keyframes: {
				marquee: {
					from: { transform: 'translateX(0)' },
					to: { transform: 'translateX(calc(-100% - var(--gap)))' },
				},
				'marquee-vertical': {
					from: { transform: 'translateY(0)' },
					to: { transform: 'translateY(calc(-100% - var(--gap)))' },
				},
				aurora: { // 👈 added
					from: {
						backgroundPosition: "50% 50%, 50% 50%",
					},
					to: {
						backgroundPosition: "350% 50%, 350% 50%",
					},
				},
				'fade-in': {
					from: { opacity: '0' },
					to: { opacity: '1' },
				},
				'scale-in': {
					from: { opacity: '0', transform: 'scale(0.96)' },
					to: { opacity: '1', transform: 'scale(1)' },
				},
			},
		},
	}
	
