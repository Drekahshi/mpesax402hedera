/**
 * /api/profile  —  GET + POST
 *
 * Stores the user profile in the `profiles` Prisma table keyed by wallet address.
 * Falls back to an in-memory store when no DATABASE_URL is set (dev / preview).
 */
import { NextResponse } from 'next/server';

/* ── in-memory fallback ───────────────────────────────────────── */
const MEM: Record<string, object> = {};

async function getPrisma() {
  if (!process.env.DATABASE_URL) return null;
  try {
    const { prisma } = await import('@/lib/prisma');
    return prisma;
  } catch {
    return null;
  }
}

/* ── GET /api/profile?wallet=0x… ──────────────────────────────── */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const wallet = searchParams.get('wallet')?.toLowerCase();
  if (!wallet) return NextResponse.json({ profile: null });

  const prisma = await getPrisma();
  if (prisma) {
    try {
      const kaiUser = await (prisma as any).kaiUser.findFirst({
        where: {
          wallets: { some: { address: { equals: wallet, mode: 'insensitive' } } },
        },
        include: { wallets: true },
      });
      if (kaiUser) return NextResponse.json({ profile: kaiUser });
    } catch { /* fall through to mem */ }
  }

  return NextResponse.json({ profile: MEM[wallet] ?? null });
}

/* ── POST /api/profile ────────────────────────────────────────── */
export async function POST(req: Request) {
  const body = await req.json();
  const wallet: string = (body.walletAddress ?? '').toLowerCase();
  if (!wallet) return NextResponse.json({ error: 'walletAddress required' }, { status: 400 });

  // Build a clean profile object from the submitted form
  const profile = {
    walletAddress: wallet,
    displayName:   body.displayName   ?? '',
    phone:         body.phone         ?? '',
    county:        body.county        ?? '',
    idNumber:      body.idNumber      ?? '',

    // CFA membership
    cfaGroup:      body.cfaGroup      ?? '',
    cfaRole:       body.cfaRole       ?? '',
    cfaRegion:     body.cfaRegion     ?? '',
    cfaJoinYear:   body.cfaJoinYear   ?? '',

    // SME
    businessName:  body.businessName  ?? '',
    businessType:  body.businessType  ?? '',
    businessLocation: body.businessLocation ?? '',
    annualTurnover: body.annualTurnover ?? '',
    mpesaNumber:   body.mpesaNumber   ?? '',

    // Saving Group (Chama)
    chamaName:     body.chamaName     ?? '',
    chamaRole:     body.chamaRole     ?? '',
    chamaRegNo:    body.chamaRegNo    ?? '',
    monthlyContrib: body.monthlyContrib ?? '',

    // KAI ecosystem preferences
    riskTolerance: body.riskTolerance ?? 'medium',
    preferredVault: body.preferredVault ?? '',
    notifications: body.notifications ?? true,

    updatedAt: new Date().toISOString(),
  };

  // Persist in Prisma if available
  const prisma = await getPrisma();
  if (prisma) {
    try {
      // Upsert KaiUser by wallet address
      const existing = await (prisma as any).kaiWallet.findFirst({
        where: { address: { equals: wallet, mode: 'insensitive' } },
      });

      if (!existing) {
        // Create new KaiUser + wallet
        await (prisma as any).kaiUser.create({
          data: {
            name:  profile.displayName || 'KAI User',
            email: `${wallet.slice(2, 10)}@kai.local`,
            phone: profile.phone || undefined,
            wallets: {
              create: [{ chain: 'ETHEREUM', address: wallet }],
            },
          },
        });
      }
    } catch { /* non-fatal */ }
  }

  // Always persist in memory (works without DB)
  MEM[wallet] = profile;

  return NextResponse.json({ ok: true, profile });
}
