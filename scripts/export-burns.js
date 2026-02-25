/**
 * Export burnt_nfts collection from MongoDB to CSV.
 *
 * Usage:
 *   node scripts/export-burns.js              → saves to burnt-nfts-export.csv
 *   node scripts/export-burns.js output.csv   → saves to output.csv
 *
 * Reads MONGODB_URI from .env.local automatically.
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// ── Load .env.local ──
const envPath = path.resolve(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = 'de_evils_burn';
const COLLECTION = 'burnt_nfts';

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI not found. Set it in .env.local or as an environment variable.');
  process.exit(1);
}

// CSV columns — matches BurntNFT interface
const COLUMNS = [
  'mint',
  'name',
  'upgradeTargetMint',
  'upgradeTargetName',
  'burntBy',
  'transactionSignature',
  'burntAt',
];

function escapeCsv(value) {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function main() {
  const outputFile = process.argv[2] || 'burnt-nfts-export.csv';
  const outputPath = path.resolve(process.cwd(), outputFile);

  console.log(`Connecting to MongoDB…`);
  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  const db = client.db(DB_NAME);
  const collection = db.collection(COLLECTION);

  const count = await collection.countDocuments();
  console.log(`Found ${count} records in ${COLLECTION}`);

  if (count === 0) {
    console.log('No data to export.');
    await client.close();
    return;
  }

  const cursor = collection.find().sort({ burntAt: -1 });

  // Write CSV
  const rows = [COLUMNS.join(',')]; // header

  let exported = 0;
  for await (const doc of cursor) {
    const row = COLUMNS.map((col) => escapeCsv(doc[col]));
    rows.push(row.join(','));
    exported++;
  }

  fs.writeFileSync(outputPath, rows.join('\n'), 'utf-8');
  console.log(`✅ Exported ${exported} records → ${outputPath}`);

  await client.close();
}

main().catch((err) => {
  console.error('❌ Export failed:', err.message);
  process.exit(1);
});
