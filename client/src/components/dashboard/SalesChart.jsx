import { useContext } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer,
} from 'recharts';
import { ThemeContext } from '../../context/ThemeContext';

const RANGE_TITLE = { day: "Today's Sales", week: 'Weekly Sales', month: 'Monthly Sales' };

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-xl px-4 py-3 text-sm">
            <p className="text-gray-500 dark:text-gray-400 mb-1">{label}</p>
            <p className="font-bold text-indigo-600 dark:text-indigo-400">KES {Number(payload[0].value).toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
            {payload[0].payload.count !== undefined && (
                <p className="text-gray-400 dark:text-gray-500 text-xs mt-0.5">{payload[0].payload.count} transaction{payload[0].payload.count !== 1 ? 's' : ''}</p>
            )}
        </div>
    );
}

export default function SalesChart({ data = [], range = 'day' }) {
    // Recharts styling (grid stroke, tick fill) is set via inline SVG props,
    // not className, so it needs the theme read directly here rather than
    // through a Tailwind dark: variant.
    const { theme } = useContext(ThemeContext);
    const isDark = theme === 'dark';
    const gridStroke = isDark ? '#334155' : '#f1f5f9';
    const tickFill = isDark ? '#64748b' : '#94a3b8';

    return (
        <div>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">
                {RANGE_TITLE[range] ?? 'Sales Trend'}
            </h3>
            {data.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 dark:text-gray-500 text-sm">
                    No sales recorded for this period.
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                        <defs>
                            <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%"  stopColor="#4f46e5" stopOpacity={0.15} />
                                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                        <XAxis
                            dataKey="date"
                            tick={{ fontSize: 11, fill: tickFill }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <YAxis
                            tickFormatter={(v) => `KES ${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`}
                            tick={{ fontSize: 11, fill: tickFill }}
                            axisLine={false}
                            tickLine={false}
                            width={70}
                        />
                        <Tooltip content={<CustomTooltip />} />
                        <Area
                            type="monotone"
                            dataKey="total"
                            stroke="#4f46e5"
                            strokeWidth={2.5}
                            fill="url(#salesGradient)"
                            dot={{ r: 3, fill: '#4f46e5', strokeWidth: 0 }}
                            activeDot={{ r: 5, fill: '#4f46e5' }}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
