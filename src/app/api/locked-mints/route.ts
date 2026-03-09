import { NextRequest, NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import { getBurntNFTsCollection } from '@/lib/mongodb';

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  
  // Try exact match first
  if (appUrl && origin === appUrl) return true;
  
  // If appUrl doesn't have protocol, try adding https://
  if (appUrl && !appUrl.startsWith('http')) {
    if (origin === `https://${appUrl}` || origin === `http://${appUrl}`) {
      return true;
    }
  }

  // Development check
  if (process.env.NODE_ENV === 'development') {
    return /^https?:\/\/localhost(:\d+)?$/.test(origin);
  }

  return false;
}

/**
 * GET /api/locked-mints?wallet=<address>
 *
 * Returns the set of mint addresses that have been recorded as upgrade targets
 * for burns made by this wallet. These NFTs must NOT be selectable for burning.
 */
export async function GET(request: NextRequest) {
  try {
    // Get origin from request headers
    const origin = request.headers.get('origin');
    const referer = request.headers.get('referer');
    
    // Extract origin from referer
    let refererOrigin: string | null = null;
    if (referer) {
      try {
        refererOrigin = new URL(referer).origin;
      } catch {
        // Invalid referer URL, skip it
      }
    }

    // Log for debugging (remove in production if needed)
    console.log('[locked-mints] Origin validation:', {
      origin,
      refererOrigin,
      appUrl: process.env.NEXT_PUBLIC_APP_URL,
      nodeEnv: process.env.NODE_ENV,
    });

    const originAllowed = isAllowedOrigin(origin) || isAllowedOrigin(refererOrigin);
    
    if (!originAllowed) {
      console.warn('[locked-mints] Origin rejected:', { origin, refererOrigin });
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    const wallet = request.nextUrl.searchParams.get('wallet');
    if (!wallet) {
      return NextResponse.json(
        { success: false, error: 'Missing wallet parameter' },
        { status: 400 },
      );
    }

    // Validate wallet address
    try {
      new PublicKey(wallet);
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid wallet address' },
        { status: 400 },
      );
    }

    const collection = await getBurntNFTsCollection();

    // Find all upgrade target mints for burns made by this wallet
    const records = await collection
      .find(
        {
          burntBy: wallet,
          upgradeTargetMint: { $exists: true, $ne: '' },
        },
        { projection: { upgradeTargetMint: 1, _id: 0 } },
      )
      .toArray();

    const lockedMints = records
      .map((r) => r.upgradeTargetMint)
      .filter((m): m is string => !!m);

    return NextResponse.json({ success: true, lockedMints });
  } catch (error: any) {
    console.error('[locked-mints] GET error:', error?.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}