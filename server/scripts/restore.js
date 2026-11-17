#!/usr/bin/env node
// Usage:  node scripts/restore.js <backupDir> --uri <targetMongoUri> [--db <name>] [--drop] --yes
// Restores a backup made by scripts/backup.js. Deliberately does NOT default
// to MONGO_URI: point it at a scratch/staging database first and check the
// data (a "restore drill"), and only restore over production on purpose.
//   --drop   replace a non-empty target database (otherwise it refuses)
//   --yes    required; confirms you mean it
const path = require('path');
const { restore } = require('./backupLib');

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

(async () => {
  const fromDir = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : null;
  const uri = arg('--uri');
  if (!fromDir || !uri) {
    console.error('Usage: node scripts/restore.js <backupDir> --uri <targetMongoUri> [--db <name>] [--drop] --yes');
    process.exit(2);
  }
  if (!process.argv.includes('--yes')) {
    console.error('Refusing to run without --yes. Double-check the target URI first.');
    process.exit(2);
  }
  const result = await restore({ uri, dbName: arg('--db'), fromDir, drop: process.argv.includes('--drop') });
  const total = Object.values(result.restored).reduce((s, n) => s + n, 0);
  console.log(`Restored ${Object.keys(result.restored).length} collections (${total} documents) into "${result.database}" — counts verified against the manifest`);
})().catch((err) => { console.error('Restore FAILED:', err.message); process.exit(1); });
