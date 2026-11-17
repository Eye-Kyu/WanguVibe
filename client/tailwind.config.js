/** @type {import('tailwindcss').Config} */

// Every palette the markup names resolves to a Coral token in
// src/tokens.css (Hallmark restyle), so the system lives in one place and
// the app's class strings did not have to change. `scale(name)` maps
// Tailwind's 50…950 steps onto `--<name>-<step>` OKLCH channels, keeping
// opacity modifiers (bg-black/50, bg-indigo-50/60) working.
const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];
const scale = (name) =>
  Object.fromEntries(STEPS.map((s) => [s, `oklch(var(--${name}-${s}) / <alpha-value>)`]));

const stone = scale('stone');
const ink = scale('ink');
const sage = scale('sage');
const clay = scale('clay');
const ochre = scale('ochre');
const slate = scale('slate');

// The stock edge and the cast that falls right, from one light on the left.
const edge = 'inset 0 1px 0 oklch(var(--lit) / 0.9), 0 0 0 0.5px oklch(var(--shade) / 0.18), 0 1px 0 oklch(var(--shade) / 0.08)';

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    // Replaced outright (not extended) so no stock Tailwind hue can leak in.
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      inherit: 'inherit',
      white: 'oklch(var(--tw-white) / <alpha-value>)',
      black: 'oklch(var(--tw-black) / <alpha-value>)',
      gray: stone, slate: stone, zinc: stone, neutral: stone, stone,
      indigo: ink,
      green: sage, emerald: sage, lime: sage, teal: sage,
      red: clay, rose: clay, pink: clay,
      amber: ochre, yellow: ochre, orange: ochre,
      purple: slate, violet: slate, blue: slate, sky: slate, cyan: slate, fuchsia: slate,
      primary: 'oklch(var(--ink-600) / <alpha-value>)',
      secondary: 'oklch(var(--sage-600) / <alpha-value>)',
      accent: 'oklch(var(--stone-500) / <alpha-value>)',
    },
    // A gentle curve, never a pill on a control: fields and cards 6px,
    // buttons and panels 8px, dialogs 10px. rounded-full stays for avatars,
    // dots and badges.
    borderRadius: {
      none: '0',
      sm: '6px',
      DEFAULT: '6px',
      md: '6px',
      lg: '8px',
      xl: '8px',
      '2xl': '10px',
      '3xl': '12px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      sm: `${edge}`,
      DEFAULT: `${edge}, 4px 4px 8px -6px oklch(var(--shade) / 0.25)`,
      md: `${edge}, 6px 5px 10px -6px oklch(var(--shade) / 0.3)`,
      lg: `${edge}, 10px 9px 18px -10px oklch(var(--shade) / 0.32)`,
      xl: `${edge}, 14px 12px 28px -12px oklch(var(--shade) / 0.34)`,
      '2xl': `${edge}, 20px 18px 40px -16px oklch(var(--shade) / 0.38)`,
      inner: 'inset 1px 1.5px 2px oklch(var(--shade) / 0.16), inset -1px -1px 0 oklch(var(--lit) / 0.9)',
    },
    fontFamily: {
      sans: ['"General Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
    },
    extend: {
      fontSize: {
        sm: '0.8125rem',
        base: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
        '6xl': '3.75rem',
        '7xl': '4.5rem',
        '8xl': '6rem',
        '9xl': '8rem',
      },
      letterSpacing: {
        tight: '-0.015em',
        tighter: '-0.03em',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)',
        out: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        DEFAULT: '220ms',
      },
      // Previously these sat outside `extend`, which silently deleted
      // Tailwind's own animate-pulse/animate-spin (loading skeletons and
      // spinners never moved).
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'scale-in': 'scale-in 0.15s ease-out',
      },
      keyframes: {
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
  },
};
