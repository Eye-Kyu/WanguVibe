// Offline sales queue + cached-catalog fallback, backing the POS's
// offline-first behavior. Scope is deliberately narrow: only cash/card
// single-method sales are ever queued (see POSPage.jsx's handleConfirmPayment)
// — store-credit/gift-card balances can't be safely verified offline, and
// M-Pesa is definitionally impossible offline.
import { openDB } from 'idb';

const DB_NAME = 'wanguvibe-pos-offline';
const DB_VERSION = 1;
const SALES_STORE = 'pendingSales';
const CATALOG_STORE = 'catalogCache';

function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SALES_STORE)) {
        db.createObjectStore(SALES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE); // keyed by a fixed string, see cacheStyles/getCachedStyles
      }
    },
  });
}

// ── Pending sales queue ─────────────────────────────────────────────────
export async function queueSale(payload) {
  const db = await getDb();
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    payload,
    status: 'pending',
    queuedAt: new Date().toISOString(),
    error: null,
  };
  await db.put(SALES_STORE, entry);
  return entry;
}

export async function getPendingSales() {
  const db = await getDb();
  const all = await db.getAll(SALES_STORE);
  return all.filter((e) => e.status === 'pending');
}

export async function getFailedSales() {
  const db = await getDb();
  const all = await db.getAll(SALES_STORE);
  return all.filter((e) => e.status === 'failed');
}

export async function removeSale(id) {
  const db = await getDb();
  await db.delete(SALES_STORE, id);
}

// Puts a failed entry back in the queue (e.g. after restocking the item it
// was rejected for). Safe to resend: the payload carries its clientSaleId,
// so the server returns the original if it had in fact been saved.
export async function retryFailedSale(id) {
  const db = await getDb();
  const entry = await db.get(SALES_STORE, id);
  if (!entry) return;
  entry.status = 'pending';
  entry.error = null;
  await db.put(SALES_STORE, entry);
}

export async function markSaleFailed(id, error) {
  const db = await getDb();
  const entry = await db.get(SALES_STORE, id);
  if (!entry) return;
  entry.status = 'failed';
  entry.error = error;
  await db.put(SALES_STORE, entry);
}

// Walks every pending entry and tries to submit it for real. `postSale` is
// injected (rather than importing the axios instance directly) so this
// module has no dependency on the API client's own shape/auth handling.
// `onRejected(entry, message)` (optional) is told about each sale the
// server refused, so it can be reported — a rejected cash sale means money
// in the drawer with no sale behind it.
export async function flushQueue(postSale, { onRejected } = {}) {
  const pending = await getPendingSales();
  const result = { synced: 0, failed: 0 };
  for (const entry of pending) {
    try {
      await postSale(entry.payload);
      await removeSale(entry.id);
      result.synced++;
    } catch (err) {
      // A real rejection (e.g. sold out via another till while offline) —
      // surface it for manual resolution rather than retrying forever or
      // silently dropping the sale. A network error (still offline) leaves
      // the entry untouched so the next flush attempt retries it.
      if (err.response) {
        const message = err.response.data?.error || 'Rejected by server';
        await markSaleFailed(entry.id, message);
        result.failed++;
        if (onRejected) {
          try { await onRejected(entry, message); } catch { /* reporting is best-effort */ }
        }
      }
    }
  }
  return result;
}

// ── Cached catalog (last-known styles, for offline browsing) ───────────
const CATALOG_KEY = 'styles';

export async function cacheStyles(styles) {
  const db = await getDb();
  await db.put(CATALOG_STORE, { styles, cachedAt: new Date().toISOString() }, CATALOG_KEY);
}

export async function getCachedStyles() {
  const db = await getDb();
  return db.get(CATALOG_STORE, CATALOG_KEY);
}
