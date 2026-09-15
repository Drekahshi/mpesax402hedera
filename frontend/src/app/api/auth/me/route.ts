/**
 * GET /api/auth/me
 *
 * Verifies the Privy JWT (from Authorization: Bearer <token> header) server-side
 * using @privy-io/server-auth and returns the authenticated user's profile +
 * KaiBar point balance from the database.
 *
 * Returns 401 if the token is missing / invalid.
 * Falls back gracefully if DATABASE_URL is not configured.
 */
import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

type PrivyClientInstance = InstanceType<typeof import('@privy-io/server-auth').PrivyClient>;
let PrivyClient: PrivyClientInstance | null = null;

async function getPrivyClient() {
  if (PrivyClient) return PrivyClient;
  const appId  = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) return null;
  try {
    const { PrivyClient: PC } = await import('@privy-io/server-auth');
    PrivyClient = new PC(appId, secret);
    return PrivyClient;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  // ── 1. Extract bearer token ──────────────────────────────────────
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // ── 2. Verify with Privy server SDK (if configured) ──────────────
  let privyUserId: string | null = null;
  const privy = await getPrivyClient();
  if (privy) {
    try {
      const claims = await privy.verifyAuthToken(token);
      privyUserId = claims.userId;
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }
  }

  // ── 3. Fetch user + KaiBar balance from DB ───────────────────────
  const prisma = await getPrisma();
  if (!prisma || !privyUserId) {
    // No DB or unverified — return minimal stub
    return NextResponse.json({ user: null, kaiBar: 0 });
  }

  try {
    const user = await prisma.kaiUser.findUnique({
      where: { privyUserId },
      include: {
        wallets: true,
        kaiBarLedger: { select: { amount: true } },
        airdropEligibility: true,
      },
    });

    if (!user) {
      return NextResponse.json({ user: null, kaiBar: 0 });
    }

    const kaiBar = user.kaiBarLedger.reduce((sum, e) => sum + e.amount, 0);

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        privyUserId: user.privyUserId,
        referralCode: user.referralCode,
        status: user.status,
        wallets: user.wallets.map((w) => ({ chain: w.chain, address: w.address })),
        createdAt: user.createdAt,
      },
      kaiBar,
      airdropEligible: user.airdropEligibility?.eligible ?? false,
    });
  } catch (e) {
    console.error('[/api/auth/me]', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
