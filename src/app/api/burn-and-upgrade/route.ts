import { NextRequest, NextResponse } from 'next/server';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_BODY_BYTES = 50_000; // 50 KB

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

// ── POST — Burn functionality DISABLED ─────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    // 1. Origin guard (still validate origin to prevent CSRF)
    if (!isAllowedOrigin(request.headers.get('origin'))) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 },
      );
    }

    // 2. Content-Type validation
    if (!request.headers.get('content-type')?.includes('application/json')) {
      return NextResponse.json(
        { success: false, error: 'Content-Type must be application/json' },
        { status: 415 },
      );
    }

    // 3. Body size check (prevent large payloads)
    if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Request body too large' },
        { status: 413 },
      );
    }

    // 4. Log attempt (for security audit)
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    console.warn(`[burn-and-upgrade] Disabled endpoint called from IP: ${ip}`);

    // 5. ❌ BURN FUNCTIONALITY DISABLED
    return NextResponse.json(
      {
        success: false,
        error: 'Burn functionality has been disabled.',
        message: 'This operation is no longer available.',
      },
      { status: 403 },
    );
  } catch (error: any) {
    console.error('[burn-and-upgrade] POST error:', error?.message);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}

// ── GET — Also disabled (in case anyone tries to query) ────────────────────────
export async function GET(request: NextRequest) {
  return NextResponse.json(
    {
      success: false,
      error: 'Burn functionality has been disabled.',
      message: 'This operation is no longer available.',
    },
    { status: 403 },
  );
}
