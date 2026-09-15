const mongoose = require('mongoose');
const Sentry = require('@sentry/node');
const logger = require('../utils/logger');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        logger.info(`MongoDB Connected: ${conn.connection.host}`);
    } catch (err) {
        logger.error({ err }, 'MongoDB connection failed');
        Sentry.captureException(err);
        await Sentry.flush(2000); // give the event a chance to actually send before the process dies
        process.exit(1);
    }
};

module.exports = connectDB;
