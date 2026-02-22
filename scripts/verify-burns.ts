/**
 * verify-burns.ts
 *
 * Queries the Helius DAS API for all BURNED assets in the collection
 * since Feb 21 2026, then cross-references with MongoDB to find any
 * burns that were not recorded.
 *
 * Usage:  npx tsx scripts/verify-burns.ts
 */

import 'dotenv/config';

const RPC_ENDPOINT = process.env.NEXT_PUBLIC_RPC_ENDPOINT!;
const COLLECTION_ADDRESS = process.env.NEXT_PUBLIC_COLLECTION_ADDRESS!;
const MONGODB_URI = process.env.MONGODB_URI!;

// Only report burns on or after this date
const SINCE = new Date('2026-02-21T00:00:00.000Z');

if (!RPC_ENDPOINT || !COLLECTION_ADDRESS) {
  console.error('Missing NEXT_PUBLIC_RPC_ENDPOINT or NEXT_PUBLIC_COLLECTION_ADDRESS in .env');
  process.exit(1);
}

// ── 1. Fetch all burned assets on-chain via Helius DAS ──

interface DASAsset {
  id: string;
  burnt: boolean;
  content?: {
    metadata?: { name?: string };
  };
  ownership?: { owner?: string };
}

interface TransactionInfo {
  mint: string;
  name: string;
  owner: string;
  burnedAt: Date | null;
  signature: string;
}

async function fetchBurnedAssetsOnChain(): Promise<DASAsset[]> {
  let page = 1;
  const allBurned: DASAsset[] = [];

  console.log(`\nFetching burned assets from collection: ${COLLECTION_ADDRESS}`);
  console.log(`RPC: ${RPC_ENDPOINT.replace(/api-key=.*/, 'api-key=***')}`);
  console.log(`Filtering burns on-chain since: ${SINCE.toISOString()}\n`);

  while (true) {
    const response = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'searchAssets',
        params: {
          grouping: ['collection', COLLECTION_ADDRESS],
          burnt: true,
          page,
          limit: 1000,
        },
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('DAS API error:', data.error);
      break;
    }

    const items: DASAsset[] = data.result?.items || [];
    allBurned.push(...items);

    console.log(`  Page ${page}: ${items.length} burned assets found`);

    if (items.length < 1000) break;
    page++;
  }

  return allBurned;
}

// ── 2. Fetch the burn transaction timestamp for each asset ──
//    Uses getSignaturesForAddress on the asset's mint pubkey

async function fetchBurnDetails(assets: DASAsset[]): Promise<TransactionInfo[]> {
  const results: TransactionInfo[] = [];
  const total = assets.length;

  console.log(`\nFetching transaction timestamps for ${total} burned asset(s)...`);

  for (let i = 0; i < assets.length; i++) {
    const asset = assets[i];
    const name = asset.content?.metadata?.name || '(no name)';
    const owner = asset.ownership?.owner || '(unknown)';

    try {
      // getSignaturesForAddress returns most recent first
      const sigResponse = await fetch(RPC_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSignaturesForAddress',
          params: [
            asset.id,
            { limit: 5, commitment: 'finalized' },
          ],
        }),
      });

      const sigData = await sigResponse.json();
      const sigs: any[] = sigData.result || [];

      // The last signature in history (oldest) is the burn — most recent tx on a burnt asset
      const burnSig = sigs[0];
      const blockTime: number | null = burnSig?.blockTime ?? null;
      const burnedAt = blockTime ? new Date(blockTime * 1000) : null;
      const signature: string = burnSig?.signature || '';

      results.push({ mint: asset.id, name, owner, burnedAt, signature });

      if ((i + 1) % 10 === 0) {
        process.stdout.write(`  ${i + 1}/${total} processed...\r`);
      }
    } catch (err) {
      results.push({ mint: asset.id, name, owner, burnedAt: null, signature: '' });
    }
  }

  console.log(`  ${total}/${total} processed.   \n`);
  return results;
}

// ── 3. Fetch all burn records from MongoDB ──

async function fetchMongoRecords(): Promise<{ byMint: Map<string, any>; bySig: Map<string, any> }> {
  const { MongoClient } = await import('mongodb');

  if (!MONGODB_URI) {
    console.warn('No MONGODB_URI — skipping MongoDB comparison');
    return { byMint: new Map(), bySig: new Map() };
  }

  const client = new MongoClient(MONGODB_URI);
  await client.connect();

  // Must use the correct database name — matches src/lib/mongodb.ts
  const db = client.db('de_evils_burn');
  const collection = db.collection('burnt_nfts');
  const records = await collection.find({}).toArray();

  await client.close();

  const byMint = new Map<string, any>();
  const bySig = new Map<string, any>();

  for (const rec of records) {
    if (rec.mint) byMint.set(rec.mint, rec);
    if (rec.transactionSignature) bySig.set(rec.transactionSignature, rec);
  }

  return { byMint, bySig };
}

// ── 4. Cross-reference and report ──

async function main() {
  const allBurnedAssets = await fetchBurnedAssetsOnChain();
  const withDetails = await fetchBurnDetails(allBurnedAssets);

  // Apply date filter to on-chain data only
  const recentBurns = withDetails.filter(
    (b) => b.burnedAt !== null && b.burnedAt >= SINCE
  );
  const undated = withDetails.filter((b) => b.burnedAt === null);

  const { byMint, bySig } = await fetchMongoRecords();

  console.log(`${'═'.repeat(70)}`);
  console.log(`  TOTAL BURNED IN COLLECTION (all time): ${allBurnedAssets.length}`);
  console.log(`  BURNED ON-CHAIN SINCE ${SINCE.toDateString()}: ${recentBurns.length}`);
  if (undated.length > 0) {
    console.log(`  ⚠ Could not determine date for:        ${undated.length} (included below)`);
  }
  console.log(`  MONGODB RECORDS (all time):             ${byMint.size}`);
  console.log(`${'═'.repeat(70)}\n`);

  // Combine dated burns (since Feb 21) + undated burns (can't exclude them safely)
  const burnsToCheck = [...recentBurns, ...undated];

  const missingFromDB: TransactionInfo[] = [];

  // ── Report: All on-chain burns since Feb 21 ──
  console.log(`── ON-CHAIN BURNS SINCE ${SINCE.toDateString()} ──\n`);

  if (burnsToCheck.length === 0) {
    console.log('  No burns found on-chain since that date.\n');
  } else {
    for (const b of burnsToCheck) {
      // Match by mint address first, fall back to transaction signature
      const inDB = byMint.has(b.mint) || (b.signature && bySig.has(b.signature));
      const matchedBy = byMint.has(b.mint)
        ? 'mint'
        : b.signature && bySig.has(b.signature)
        ? 'sig'
        : null;

      const dateStr = b.burnedAt
        ? b.burnedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
        : 'unknown date ';
      const dbStatus = inDB ? `✅ in DB (by ${matchedBy})` : '❌ NOT in DB';
      console.log(`  ${dbStatus.padEnd(20)}  ${dateStr}  ${b.mint}  ${b.name}`);
      if (!inDB) missingFromDB.push(b);
    }
    console.log();
  }

  // ── Report: Missing from DB ──
  if (missingFromDB.length > 0) {
    console.log(`⚠️  BURNS MISSING FROM MONGODB (${missingFromDB.length}):\n`);
    for (const b of missingFromDB) {
      const dateStr = b.burnedAt
        ? b.burnedAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
        : 'unknown';
      console.log(`  ❌ ${b.mint}`);
      console.log(`     Name:      ${b.name}`);
      console.log(`     Owner:     ${b.owner}`);
      console.log(`     Burned at: ${dateStr}`);
      console.log(`     Tx sig:    ${b.signature || '(unavailable)'}`);
      console.log();
    }
  } else if (burnsToCheck.length > 0) {
    console.log('✅ All on-chain burns since Feb 21 are recorded in MongoDB.\n');
  }
}

main().catch((err) => {
  console.error('Script error:', err);
  process.exit(1);
});
