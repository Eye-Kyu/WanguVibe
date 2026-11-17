// Database backup/restore that needs nothing but Node and this repo — no
// mongodump install required. Each collection is written as gzipped
// Extended JSON lines (EJSON keeps ObjectIds, Dates and Decimals exact),
// alongside a manifest with document counts and index definitions so a
// restore can be verified and rebuilt faithfully.
//
// This complements, not replaces, your host's own backups (e.g. MongoDB
// Atlas continuous backup): it gives you a copy you control, off-platform.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const readline = require('readline');
const { MongoClient, BSON } = require('mongodb');

const { EJSON } = BSON;

function timestamp(d = new Date()) {
  return d.toISOString().replace(/[:.]/g, '-');
}

async function backup({ uri, dbName, outDir, keep = 14, now = new Date() }) {
  const client = await MongoClient.connect(uri);
  try {
    const db = client.db(dbName);
    const dir = path.join(outDir, `backup-${db.databaseName}-${timestamp(now)}`);
    fs.mkdirSync(dir, { recursive: true });

    const collections = (await db.listCollections({}, { nameOnly: true }).toArray())
      .map((c) => c.name)
      .filter((n) => !n.startsWith('system.'))
      .sort();

    const manifest = { database: db.databaseName, createdAt: now.toISOString(), format: 'ejson-lines-gzip/v1', collections: {} };
    for (const name of collections) {
      const file = path.join(dir, `${name}.jsonl.gz`);
      const gzip = zlib.createGzip();
      const out = fs.createWriteStream(file);
      gzip.pipe(out);
      let count = 0;
      for await (const doc of db.collection(name).find({})) {
        if (!gzip.write(`${EJSON.stringify(doc, { relaxed: false })}\n`)) {
          await new Promise((r) => gzip.once('drain', r));
        }
        count += 1;
      }
      gzip.end();
      await new Promise((resolve, reject) => { out.on('finish', resolve); out.on('error', reject); });
      const indexes = (await db.collection(name).indexes()).filter((i) => i.name !== '_id_');
      manifest.collections[name] = { count, indexes };
    }
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

    const removed = pruneOldBackups(outDir, db.databaseName, keep);
    return { dir, manifest, removed };
  } finally {
    await client.close();
  }
}

function pruneOldBackups(outDir, dbName, keep) {
  if (!keep || keep < 1) return [];
  const prefix = `backup-${dbName}-`;
  const dirs = fs.readdirSync(outDir)
    .filter((n) => n.startsWith(prefix) && fs.existsSync(path.join(outDir, n, 'manifest.json')))
    .sort(); // ISO timestamps sort chronologically
  const toRemove = dirs.slice(0, Math.max(0, dirs.length - keep));
  for (const n of toRemove) fs.rmSync(path.join(outDir, n), { recursive: true, force: true });
  return toRemove;
}

async function readDocs(file) {
  const docs = [];
  const rl = readline.createInterface({ input: fs.createReadStream(file).pipe(zlib.createGunzip()), crlfDelay: Infinity });
  for await (const line of rl) if (line.trim()) docs.push(EJSON.parse(line, { relaxed: false }));
  return docs;
}

// Restores into `dbName` at `uri`. Refuses to touch a database that already
// has data unless `drop` is set, so a restore can't silently merge into (or
// clobber) a live database by accident.
async function restore({ uri, dbName, fromDir, drop = false }) {
  const manifest = JSON.parse(fs.readFileSync(path.join(fromDir, 'manifest.json'), 'utf-8'));
  const client = await MongoClient.connect(uri);
  try {
    const db = client.db(dbName);
    const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name).filter((n) => !n.startsWith('system.'));
    if (existing.length && !drop) {
      throw new Error(`Database "${db.databaseName}" is not empty (${existing.length} collections). Re-run with --drop to replace it.`);
    }
    if (drop) for (const name of existing) await db.collection(name).drop();

    const restored = {};
    for (const [name, meta] of Object.entries(manifest.collections)) {
      const docs = await readDocs(path.join(fromDir, `${name}.jsonl.gz`));
      const coll = db.collection(name);
      for (let i = 0; i < docs.length; i += 1000) await coll.insertMany(docs.slice(i, i + 1000), { ordered: false });
      for (const idx of meta.indexes || []) {
        const { key, name: idxName, v, ns, ...options } = idx; // eslint-disable-line no-unused-vars
        await coll.createIndex(key, { name: idxName, ...options });
      }
      const count = await coll.countDocuments();
      if (count !== meta.count) throw new Error(`Restore check failed for ${name}: expected ${meta.count} documents, found ${count}`);
      restored[name] = count;
    }
    return { database: db.databaseName, restored };
  } finally {
    await client.close();
  }
}

module.exports = { backup, restore, pruneOldBackups };
