import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

const stockColor = (stock) => {
    if (stock === 0)   return '#ef4444'; // red — out of stock
    if (stock < 10)    return '#f59e0b'; // amber — critical
    if (stock < 30)    return '#0ea5e9'; // blue — low
    return '#10b981';                    // green — healthy
};

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    const stock = payload[0].value;
    return (
        <div className="bg-white border border-gray-200 shadow-lg rounded-lg px-3 py-2 text-sm">
            <p className="font-semibold text-gray-800 mb-0.5">{label}</p>
            <p style={{ color: stockColor(stock) }} className="font-bold">
                {stock === 0 ? 'Out of stock' : `${stock} units`}
            </p>
        </div>
    );
}

export default function BarChartStockLevels({ data = [] }) {
    return (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h2 className="font-semibold text-gray-800">Product Stock Levels</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Current inventory across all products</p>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap justify-end">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> Healthy (&ge;30)</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> Low (&lt;30)</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Critical (&lt;10)</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> Out of stock</span>
                </div>
            </div>
            {data.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">
                    No product data available.
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                        <XAxis
                            dataKey="name"
                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                            axisLine={false}
                            tickLine={false}
                            angle={-35}
                            textAnchor="end"
                            interval={0}
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: '#94a3b8' }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f8fafc' }} />
                        <ReferenceLine y={10} stroke="#f59e0b" strokeDasharray="4 3" strokeWidth={1.5} />
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
