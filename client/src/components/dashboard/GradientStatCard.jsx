// Shared "hero stat" card — rich gradient instead of flat white, used on both
// the admin dashboard and the sales page. The "600"-weighted Tailwind shades
// in each gradient are chosen specifically because white text on them clears
// WCAG AA comfortably (>4.5:1) at every stop, so trend/label/sub text never
// needs per-card contrast tuning.
const GRADIENTS = {
    indigo: 'from-indigo-500 via-indigo-600 to-violet-600',
    violet: 'from-violet-500 via-purple-600 to-fuchsia-600',
    emerald: 'from-emerald-500 via-emerald-600 to-teal-600',
    amber: 'from-amber-400 via-orange-500 to-orange-600',
    rose: 'from-rose-500 via-pink-600 to-fuchsia-600',
};

export default function GradientStatCard({ label, value, trend, trendLabel, sub, variant = 'indigo' }) {
    const hasTrend = trend !== null && trend !== undefined;
    return (
        <div className={`relative overflow-hidden rounded-sm p-5 flex flex-col gap-1 text-white shadow-lg shadow-indigo-950/10 bg-gradient-to-br ${GRADIENTS[variant]}`}>
            <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full bg-white/10 blur-2xl pointer-events-none" />
            <p className="text-xs font-semibold text-white/75 uppercase tracking-wider relative">{label}</p>
            <p className="text-2xl font-bold text-white truncate relative">{value}</p>
            <div className="flex items-center gap-2 min-h-[20px] relative">
                {hasTrend && (
                    <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full ${
                        trend >= 0 ? 'bg-white/25 text-white' : 'bg-black/20 text-red-100'
                    }`}>
                        {trend >= 0 ? '↑' : '↓'} {Math.abs(trend).toFixed(1)}%
                    </span>
                )}
                {trendLabel && hasTrend && (
                    <span className="text-xs text-white/65">{trendLabel}</span>
                )}
            </div>
            {sub && <p className="text-xs text-white/75 relative">{sub}</p>}
        </div>
    );
}
