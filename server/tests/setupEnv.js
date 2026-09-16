// Runs before the test framework and any app modules are loaded (Jest
// `setupFiles`), since services/etims.js and services/mpesa.js read their
// MODE from process.env at require-time, not per-call.
process.env.ETIMS_MODE = process.env.ETIMS_MODE || 'mock';
process.env.MPESA_MODE = process.env.MPESA_MODE || 'mock';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
// A real (but throwaway, not the app's actual) VAPID keypair — just needs to
// be valid enough for web-push's setVapidDetails() to not throw at require
// time, so tests can exercise notifyAdmins() with webpush.sendNotification mocked.
process.env.VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'BK5dJtOSyxCydjST1XQXOH_qX54TGX30t6HVf9-4mmeVkZ2b3nuAOIhrQ6gYupkM3N9n0i2Cq4pZE_-xi2a2RRY';
process.env.VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'voj6XsbyFB6PEmUBbS4IxXJjiu78_6ot-guY0WioflI';
process.env.VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:test@example.com';
