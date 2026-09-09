import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#4f46e5', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];

function CustomTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-sm">
            <p className="font-semibold text-gray-800">{payload[0].name}</p>
            <p className="text-gray-500">{payload[0].value} units sold</p>
        </div>
    );
}

export default function PieChartBestsellers({ data = [] }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="font-semibold text-gray-800 mb-1">Top 5 Bestsellers</h2>
            <p className="text-xs text-gray-400 mb-4">Units sold in selected period</p>
            {data.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
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
                                <span className="text-xs text-gray-600">{val}</span>
                            )}
                        />
                    </PieChart>
                </ResponsiveContainer>
            )}
        </div>
    );
}
