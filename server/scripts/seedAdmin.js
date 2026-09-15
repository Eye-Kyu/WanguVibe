// One-off/idempotent admin bootstrap. Run with:
//   node scripts/seedAdmin.js <username> <password> [name]
// Needed because /api/auth/register is admin-only, so the very first
// admin account has to be created directly against the database.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');

async function main() {
  const [username, password, name] = process.argv.slice(2);
  if (!username || !password) {
    console.error('Usage: node scripts/seedAdmin.js <username> <password> [name]');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const hashed = await bcrypt.hash(password, 10);
  const user = await User.findOneAndUpdate(
    { username },
    { $set: { name: name || username, password: hashed, role: 'admin' } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  console.log(`Admin user ready: ${user.username} (role: ${user.role})`);
  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
