// Runs before the test framework and any app modules are loaded (Jest
// `setupFiles`), since services/etims.js and services/mpesa.js read their
// MODE from process.env at require-time, not per-call.
process.env.ETIMS_MODE = process.env.ETIMS_MODE || 'mock';
process.env.MPESA_MODE = process.env.MPESA_MODE || 'mock';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
