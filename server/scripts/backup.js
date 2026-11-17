#!/usr/bin/env node
// Usage:  node scripts/backup.js [outDir]
//   MONGO_URI      source database (required; read from server/.env)
//   BACKUP_DIR     where to write (default ./backups, or the outDir arg)
//   BACKUP_KEEP    how many backups to keep before pruning the oldest (default 14)
// Schedule it daily (cron, Windows Task Scheduler, or your host's cron
// feature) and copy the output somewhere off the server — see docs/GO-LIVE.md.
require('dotenv').config();
const path = require('path');
const { backup } = require('./backupLib');

(async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) { console.error('MONGO_URI is not set'); process.exit(2); }
  const outDir = path.resolve(process.argv[2] || process.env.BACKUP_DIR || 'backups');
  const keep = Number(process.env.BACKUP_KEEP) || 14;
  const started = Date.now();
  const { dir, manifest, removed } = await backup({ uri, outDir, keep });
  const total = Object.values(manifest.collections).reduce((s, c) => s + c.count, 0);
  console.log(`Backed up ${Object.keys(manifest.collections).length} collections (${total} documents) to ${dir} in ${Date.now() - started} ms`);
  if (removed.length) console.log(`Pruned ${removed.length} old backup(s)`);
})().catch((err) => { console.error('Backup FAILED:', err.message); process.exit(1); });
