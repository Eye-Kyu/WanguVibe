require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const connectDB = require('./config/db');

const authRoutes = require('./routes/auth');
const styleRoutes = require('./routes/styles');
const variantRoutes = require('./routes/variants');
const customerRoutes = require('./routes/customers');
const salesRoutes = require('./routes/sales');
const inventoryRoutes = require('./routes/inventory');
const auditRoutes = require('./routes/audit');
const dashboardRoutes = require('./routes/dashboard');
const adminRoutes = require('./routes/admin');


connectDB();

const app = express();

app.use(cors());
app.use(express.json()); //  Parse JSON bodies


// Routes
app.use('/api/auth', authRoutes);
app.use('/api/styles', styleRoutes);
app.use('/api/variants', variantRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sales', salesRoutes);


//admin assigns role
app.use('/api/admin', adminRoutes);
//admin can delete users
app.use('/api/users', require('./routes/users'));
//audit logging
app.use('/api/audit', auditRoutes);


// Test route
app.get('/', (req, res) => res.send('POS API Running'));



// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
