import { MongoClient, Db, Collection } from 'mongodb';
import { BurntNFT } from '@/types';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'de_evils_burn';

if (!MONGODB_URI) {
  throw new Error('Please add MONGODB_URI to your .env.local file');
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
  // eslint-disable-next-line no-var
  var _indexesEnsured: number | undefined;
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === 'development') {
  if (!global._mongoClientPromise) {
    const c = new MongoClient(MONGODB_URI);
    global._mongoClientPromise = c.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  const c = new MongoClient(MONGODB_URI);
  clientPromise = c.connect();
}

export async function getDb(): Promise<Db> {
  const client = await clientPromise;
  return client.db(DB_NAME);
}

// Version bump this whenever index definitions change — forces re-run even if
// the global flag was cached from a previous HMR cycle.
const INDEX_VERSION = 3;

// Create all indexes once per process lifecycle (idempotent, no-op after first run)
async function ensureIndexes(db: Db) {
  if (global._indexesEnsured === INDEX_VERSION) return;

  const col = db.collection('burnt_nfts');

  // Drop old indexes whose options changed (unique → non-unique).
  for (const idx of ['transactionSignature_1', 'upgradeTargetMint_1']) {
    try { await col.dropIndex(idx); } catch { /* may not exist */ }
  }

  await Promise.all([
    // Unique constraints — primary defence against duplicates
    col.createIndex({ mint: 1 }, { unique: true }),
    // Unique sparse — each upgrade target can only be claimed by one burn
    col.createIndex({ upgradeTargetMint: 1 }, { unique: true, sparse: true }),
    // Non-unique — allows multiple mints per transaction (batched burns)
    col.createIndex({ transactionSignature: 1 }),
    col.createIndex({ burntAt: -1 }),
    col.createIndex({ burntBy: 1 }),
  ]);

  // Rate-limit collection with TTL
  const rl = db.collection('rate_limits');
  try {
    await rl.createIndex({ createdAt: 1 }, { expireAfterSeconds: 60 });
    await rl.createIndex({ ip: 1 });
  } catch { /* already exists */ }

  global._indexesEnsured = INDEX_VERSION;
}

export async function getBurntNFTsCollection(): Promise<Collection<BurntNFT>> {
  const db = await getDb();
  await ensureIndexes(db);
  return db.collection<BurntNFT>('burnt_nfts');
}

export async function getRateLimitCollection(): Promise<Collection<{ ip: string; createdAt: Date }>> {
  const db = await getDb();
  await ensureIndexes(db);
  return db.collection('rate_limits');
}
