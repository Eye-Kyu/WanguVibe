import { useContext } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { ThemeContext } from '../../context/ThemeContext';
import { chartSeries } from '../../config/chartColors';


function CustomTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-lg rounded-xl px-3 py-2 text-sm">
            <p className="font-semibold text-gray-800 dark:text-gray-100">{payload[0].name}</p>
            <p className="text-gray-500 dark:text-gray-400">{payload[0].value} units sold</p>
        </div>
    );
}

export default function PieChartBestsellers({ data = [] }) {
    const { theme } = useContext(ThemeContext);
    const COLORS = chartSeries(theme === 'dark');
    return (
        <div className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-900 dark:to-gray-900 rounded-sm border border-gray-100 dark:border-gray-800 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 dark:text-gray-100 mb-1">Top 5 Bestsellers</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">Units sold in selected period</p>
            {data.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-500 dark:text-gray-400 text-sm">
                    No sales data for this period.
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={260}>
                    <PieChart>
                        <Pie
                            data={data}
                            dataKey="qty"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            paddingAngle={2}
                        >
                            {data.map((_, i) => (
                                <Cell key={i} fill={COLORS[i % COLORS.length]} />
                            ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />} />
                        <Legend
                            iconType="circle"
                            iconSize={8}
                            formatter={(val) => (
                                <span className="text-xs text-gray-600 dark:text-gray-300">{val}</span>
                            )}
                        />
                    </PieChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
