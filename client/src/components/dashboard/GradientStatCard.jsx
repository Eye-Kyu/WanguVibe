// Shared "hero stat" card, used on the admin dashboard and the sales page.
// Coral restyle: a cotton card with the figure in ink, not a coloured
// gradient. `variant` is still accepted (callers pass it) and only tints the
// thin rule along the card's top edge, so the four stats stay tellable apart
// without colour carrying meaning on its own.
const RULES = {
    indigo: 'before:bg-gray-900 dark:before:bg-gray-100',
    violet: 'before:bg-gray-500',
    emerald: 'before:bg-green-600',
    amber: 'before:bg-amber-500',
    rose: 'before:bg-red-500',
};

export default function GradientStatCard({ label, value, trend, trendLabel, sub, variant = 'indigo' }) {
    const hasTrend = trend !== null && trend !== undefined;
    return (
        <div className={`relative overflow-hidden rounded-sm p-5 flex flex-col gap-1.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-md before:absolute before:inset-x-0 before:top-0 before:h-0.5 ${RULES[variant] || RULES.indigo}`}>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-gray-50 truncate tabular-nums">{value}</p>
            <div className="flex items-center gap-2 min-h-[20px]">
                {hasTrend && (
                    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full tabular-nums ${
                        trend >= 0
                            ? 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                            : 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    }`}>
                        {trend >= 0 ? '+' : '−'}{Math.abs(trend).toFixed(1)}%
                    </span>
                )}
                {trendLabel && hasTrend && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">{trendLabel}</span>
                )}
            </div>
            {sub && <p className="text-xs text-gray-500 dark:text-gray-400">{sub}</p>}
        </div>
    );
}
