const Sale = require('../models/Sale');
const Product = require('../models/Product');

const getStartDate = (range) => {
    const now = new Date();

    if (range === 'week') {
        const start = new Date();
        start.setDate(start.getDate() - 6);
        return start;
    }

    if (range === 'month') {
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }

    return new Date(now.setHours(0, 0, 0, 0));
};

exports.getSummary = async (req, res) => {
    const range = req.query.range || 'day';
    const startDate = getStartDate(range);

    try {
        const [
            salesTotal,
            totalStock,
            bestSeller,
            topProducts,
            stockLevels,
            lowStockItems
        ] = await Promise.all([

            // Sales for selected range
            Sale.aggregate([
                { $match: { date: { $gte: startDate } } },
                { $group: { _id: null, total: { $sum: "$total" } } }
            ]),

            // Total stock
            Product.aggregate([
                { $group: { _id: null, totalStock: { $sum: "$stock" } } }
            ]),

            // Best seller
            Sale.aggregate([
                { $unwind: "$items" },
                { $group: { _id: "$items.product", qty: { $sum: "$items.quantity" } } },
                { $sort: { qty: -1 } },
                { $limit: 1 },
                {
                    $lookup: {
                        from: "products",
                        localField: "_id",
                        foreignField: "_id",
                        as: "product"
                    }
                },
                { $unwind: "$product" },
                { $project: { name: "$product.name", qty: 1 } }
            ]),

            // Top 5
            Sale.aggregate([
                { $unwind: "$items" },
                { $group: { _id: "$items.product", qty: { $sum: "$items.quantity" } } },
                { $sort: { qty: -1 } },
                { $limit: 5 },
                {
                    $lookup: {
                        from: "products",
                        localField: "_id",
                        foreignField: "_id",
                        as: "product"
                    }
                },
                { $unwind: "$product" },
                { $project: { name: "$product.name", qty: 1 } }
            ]),

            // Stock levels
            Product.find({}, "name stock"),

            // Low stock
            Product.find({ stock: { $lt: 10 } }).select("name stock")
        ]);

        res.json({
            totalsales: salesTotal[0]?.total || 0,
            totalStock: totalStock[0]?.totalStock || 0,
            bestSeller: bestSeller[0]?.name || "N/A",
            topProducts,
            stockLevels,
            lowStockItems
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to load dashboard summary' });
    }
};