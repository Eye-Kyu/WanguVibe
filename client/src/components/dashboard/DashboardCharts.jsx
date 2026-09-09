import { useEffect, useState } from 'react';
import {
    PieChart, Pie, Cell, Tooltip, Legend,
    BarChart, Bar, XAxis, YAxis, ResponsiveContainer,
} from 'recharts';
import api from '../../api/axiosInstance';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#A28EF4'];

export default function DashboardCharts() {
    const [topProducts, setTopProducts] = useState([]);
    const [stockLevels, setStockLevels] = useState([]);

    useEffect(() => {
        api.get('/dashboard/summary')
            .then(res => {
                setTopProducts(res.data.topProducts || []);
                setStockLevels(res.data.stockLevels || []);
            })
            .catch(err => console.error('DashboardCharts fetch failed:', err));
    }, []);

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
            {/* Pie Chart — Top 5 Bestsellers */}
            <div className="bg-white p-4 rounded-xl shadow">
                <h2 className="text-lg font-semibold mb-2">Top 5 Bestsellers</h2>
                {topProducts.length === 0 ? (
                    <p className="text-gray-400 text-center py-10">No sales data available.</p>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                            <Pie
                                data={topProducts}
                                dataKey="qty"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={100}
                                label
                            >
                                {topProducts.map((_, i) => (
                                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                )}
            </div>

            {/* Bar Chart — Stock Levels */}
            <div className="bg-white p-4 rounded-xl shadow">
                <h2 className="text-lg font-semibold mb-2">Stock Levels</h2>
                {stockLevels.length === 0 ? (
                    <p className="text-gray-400 text-center py-10">No stock data available.</p>
                ) : (
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={stockLevels}>
                            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="stock" fill="#82ca9d" />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
