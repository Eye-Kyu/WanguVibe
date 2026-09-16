import { useContext } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';
import { ThemeContext } from '../../context/ThemeContext';

// Thresholds tuned for per-variant (size/color) stock, which runs much
// smaller than a mini-mart's flat per-product counts — holding 30 units of
// one dress in one size/color would be unusual for a boutique.
const stockColor = (stock) => {
    if (stock === 0)   return '#ef4444'; // red — out of stock
    if (stock < 5)     return '#f59e0b'; // amber — critical
    if (stock < 15)    return '#0ea5e9'; // blue — low
    return '#10b981';                    // green — healthy
};

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    const stock = payload[0].value;
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-xl px-3 py-2 text-sm">
            <p className="font-semibold text-gray-800 dark:text-gray-100 mb-0.5">{label}</p>
            <p style={{ color: stockColor(stock) }} className="font-bold">
                {stock === 0 ? 'Out of stock' : `${stock} units`}
            </p>
        </div>
    );
}

export default function BarChartStockLevels({ data = [] }) {
    // Recharts styling (axis tick fill, hover-cursor fill) is set via inline
    // SVG props, not className, so it needs the theme read directly here.
    const { theme } = useContext(ThemeContext);
    const isDark = theme === 'dark';
    const tickFill = isDark ? '#64748b' : '#94a3b8';
    const cursorFill = isDark ? '#1e293b' : '#f8fafc';

    return (
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 shadow-sm p-5">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h2 className="font-semibold text-gray-800 dark:text-gray-100">Variant Stock Levels</h2>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Current inventory across all size/color variants</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 flex-wrap justify-end">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Healthy (&ge;15)</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Low (&lt;15)</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Critical (&lt;5)</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Out of stock</span>
                </div>
            </div>
            {data.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500 text-sm">
                    No variant data available.
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                        <XAxis
                            dataKey="name"
                            tick={{ fontSize: 11, fill: tickFill }}
                            axisLine={false}
                            tickLine={false}
                            angle={-35}
                            textAnchor="end"
                            interval={0}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: tickFill }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: cursorFill }} />
                        <ReferenceLine y={5} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
                        <Bar dataKey="stock" radius={[4, 4, 0, 0]} maxBarSize={48}>
                            {data.map((entry, i) => (
                                <Cell key={i} fill={stockColor(entry.stock)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
