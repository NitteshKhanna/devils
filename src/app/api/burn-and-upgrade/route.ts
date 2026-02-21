import { NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey } from '@solana/web3.js';
import { BurntNFT, BurnBatchRequest, BurnBatchResponse } from '@/types';
import { getBurntNFTsCollection, getRateLimitCollection } from '@/lib/mongodb';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_BODY_BYTES    = 50_000; // 50 KB
const MAX_STRING_LEN    = 512;
const RATE_LIMIT_MAX    = 5;     // max requests per IP per 60s window

// ── Helpers ───────────────────────────────────────────────────────────────────

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl && origin === appUrl) return true;
  if (process.env.NODE_ENV === 'development') {
    return /^https?:\/\/localhost(:\d+)?$/.test(origin);
  }
  return false;
}

function sanitizeString(value: unknown, maxLen = MAX_STRING_LEN): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '')
    .trim()
    .slice(0, maxLen);
}

async function checkRateLimit(ip: string): Promise<boolean> {
  try {
    const col = await getRateLimitCollection();
    const count = await col.countDocuments({ ip });
    if (count >= RATE_LIMIT_MAX) return false;
    await col.insertOne({ ip, createdAt: new Date() });
    return true;
  } catch {
    return true; // if rate-limit DB fails, don't block legit users
  }
}

// ── POST — Record a batch of burns with their upgrade selections ──────────────
export async function POST(request: NextRequest) {
  try {
    // 1. Origin guard
    if (!isAllowedOrigin(request.headers.get('origin'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' } as BurnBatchResponse,
        { status: 403 },
      );
    }

    // 1b. Rate limiting
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    if (!(await checkRateLimit(ip))) {
      return NextResponse.json(
        { success: false, error: 'Too many requests — try again later' } as BurnBatchResponse,
        { status: 429 },
      );
    }

    // 2. Content-Type
    if (!request.headers.get('content-type')?.includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'Content-Type must be application/json' } as BurnBatchResponse,
        { status: 415 },
      );
    }

    // 3. Body size
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Request body too large' } as BurnBatchResponse,
        { status: 413 },
      );
    }

    // 4. Parse
    let body: BurnBatchRequest;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' } as BurnBatchResponse,
        { status: 400 },
      );
    }

    const { walletAddress, burns, upgrades } = body;

    // 5. Presence check
    if (!walletAddress || !Array.isArray(burns) || burns.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' } as BurnBatchResponse,
        { status: 400 },
      );
    }

    // 6. Validate wallet
    try {
      new PublicKey(walletAddress);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address' } as BurnBatchResponse,
        { status: 400 },
      );
    }

    // 7. Validate each burn entry
    for (const burn of burns) {
      if (!burn.mintAddress || !burn.transactionSignature || !burn.name) {
        return NextResponse.json(
          { success: false, error: 'Invalid burn entry — missing fields' } as BurnBatchResponse,
          { status: 400 },
        );
      }
      try {
        new PublicKey(burn.mintAddress);
      } catch {
        return NextResponse.json(
          { success: false, error: `Invalid mint address: ${burn.mintAddress}` } as BurnBatchResponse,
          { status: 400 },
        );
      }
    }

    // 7b. No duplicate mints within the batch
    const burnMintSet = new Set(burns.map((b) => b.mintAddress));
    if (burnMintSet.size !== burns.length) {
      return NextResponse.json(
        { success: false, error: 'Duplicate mint addresses in burn list' } as BurnBatchResponse,
        { status: 400 },
      );
    }

    // 7c. Validate upgrades array
    if (!Array.isArray(upgrades) || upgrades.length !== burns.length) {
      return NextResponse.json(
        { success: false, error: 'Upgrades array must match burns array length' } as BurnBatchResponse,
        { status: 400 },
      );
    }

    // 7d. Upgrade targets must not overlap with burn mints
    const upgradeMints = upgrades.map((u) => u.upgradeMint).filter(Boolean);
    for (const um of upgradeMints) {
      if (burnMintSet.has(um)) {
        return NextResponse.json(
          { success: false, error: 'An upgrade target cannot also be a burned NFT' } as BurnBatchResponse,
          { status: 400 },
        );
      }
    }

    // 7e. No duplicate upgrade targets within the batch
    const upgradeTargetSet = new Set(upgradeMints);
    if (upgradeTargetSet.size !== upgradeMints.length) {
      return NextResponse.json(
        { success: false, error: 'Duplicate upgrade targets in request' } as BurnBatchResponse,
        { status: 400 },
      );
    }

    // 8. Check for already-recorded mints
    const collection = await getBurntNFTsCollection();
    const mintAddresses = burns.map((b) => b.mintAddress);
    const existing = await collection
      .find({ mint: { $in: mintAddresses } }, { projection: { mint: 1 } })
      .toArray();

    if (existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Already recorded: ${existing.map((e) => e.mint).join(', ')}`,
        } as BurnBatchResponse,
        { status: 409 },
      );
    }

    // 8b. Verify upgrade targets are not already claimed by another burn
    if (upgradeMints.length > 0) {
      const lockedTargets = await collection
        .find(
          { upgradeTargetMint: { $in: upgradeMints } },
          { projection: { upgradeTargetMint: 1 } },
        )
        .toArray();
      if (lockedTargets.length > 0) {
        return NextResponse.json(
          {
            success: false,
            error: `Upgrade targets already claimed: ${lockedTargets.map((t) => t.upgradeTargetMint).join(', ')}`,
          } as BurnBatchResponse,
          { status: 409 },
        );
      }
    }

    // 9. Verify transactions on-chain
    const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || 'devnet';
    const rpcEndpoint =
      process.env.NEXT_PUBLIC_RPC_ENDPOINT || `https://api.${network}.solana.com`;
    const connection = new Connection(rpcEndpoint, 'confirmed');

    // Group burns by transaction signature (batched burns share a signature)
    const txGroups = new Map<string, typeof burns>();
    for (const burn of burns) {
      const sig = burn.transactionSignature;
      if (!txGroups.has(sig)) txGroups.set(sig, []);
      txGroups.get(sig)!.push(burn);
    }

    for (const [sig, groupBurns] of txGroups) {
      const tx = await connection.getTransaction(sig, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });

      if (!tx) {
        return NextResponse.json(
          { success: false, error: `Transaction not found: ${sig.slice(0, 16)}…` } as BurnBatchResponse,
          { status: 400 },
        );
      }

      if (tx.meta?.err) {
        return NextResponse.json(
          { success: false, error: `Transaction failed on-chain: ${sig.slice(0, 16)}…` } as BurnBatchResponse,
          { status: 400 },
        );
      }

      // Fee payer must be the claimed wallet
      const feePayer = tx.transaction.message.staticAccountKeys[0]?.toBase58();
      if (feePayer !== walletAddress) {
        return NextResponse.json(
          { success: false, error: 'Transaction not signed by claimed wallet' } as BurnBatchResponse,
          { status: 400 },
        );
      }

      // Every burned mint must appear in the transaction's account keys
      const accountKeys = tx.transaction.message.staticAccountKeys.map((k) =>
        k.toBase58(),
      );
      for (const burn of groupBurns) {
        if (!accountKeys.includes(burn.mintAddress)) {
          return NextResponse.json(
            {
              success: false,
              error: `Mint ${burn.mintAddress.slice(0, 8)}… not found in transaction`,
            } as BurnBatchResponse,
            { status: 400 },
          );
        }
      }
    }

    // 10. Build upgrade mapping
    const upgradeMap = new Map<
      string,
      { mint: string; name: string }
    >();
    if (Array.isArray(upgrades)) {
      for (const u of upgrades) {
        if (u.burnedMint && u.upgradeMint) {
          upgradeMap.set(u.burnedMint, {
            mint: sanitizeString(u.upgradeMint),
            name: sanitizeString(u.upgradeName),
          });
        }
      }
    }

    // 11. Build DB records
    const now = new Date().toISOString();
    const records: BurntNFT[] = burns.map((burn) => {
      const upgrade = upgradeMap.get(burn.mintAddress);
      const safeName = sanitizeString(burn.name);

      return {
        mint: burn.mintAddress,
        name: safeName || 'Unknown',
        burntBy: walletAddress,
        transactionSignature: burn.transactionSignature,
        burntAt: now,
        ...(upgrade && {
          upgradeTargetMint: upgrade.mint,
          upgradeTargetName: upgrade.name,
        }),
      };
    });

    // 12. Atomic insert
    try {
      await collection.insertMany(records, { ordered: false });
    } catch (e: any) {
      if (e?.code === 11000) {
        return NextResponse.json(
          { success: false, error: 'Some NFTs were already recorded' } as BurnBatchResponse,
          { status: 409 },
        );
      }
      throw e;
    }

    return NextResponse.json({
      success: true,
      message: `${records.length} burns recorded with upgrade selections`,
      recorded: records.length,
    } as BurnBatchResponse);
  } catch (error: any) {
    console.error('[burn-and-upgrade] POST error:', error?.message, error?.stack);
    const devMessage =
      process.env.NODE_ENV === 'development'
        ? error?.message || 'Unknown error'
        : 'Internal server error';
    return NextResponse.json(
      { success: false, error: devMessage } as BurnBatchResponse,
      { status: 500 },
    );
  }
}
