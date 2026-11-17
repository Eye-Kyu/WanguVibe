// Chart colours come from the Coral tokens in src/tokens.css. Recharts sets
// colours as SVG attributes, which can't resolve CSS variables, so they are
// read off :root at render time and wrapped as oklch() strings.
const read = (name) => {
    if (typeof document === 'undefined') return 'currentColor';
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v ? `oklch(${v})` : 'currentColor';
};

// e.g. chartColor('tick', isDark) → the tick colour for the current theme.
export const chartColor = (name, isDark = false) => read(`--chart-${name}${isDark ? '-dark' : ''}`);

// The categorical series, ink first.
export const chartSeries = (isDark = false) =>
    [1, 2, 3, 4, 5, 6].map((i) => read(`--chart-${i}${isDark ? '-dark' : ''}`));
