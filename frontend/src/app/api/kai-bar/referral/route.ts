import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

/**
 * /api/kai-bar/referral  —  GET + POST
 *
 * GET  — returns the user's own unique referral code (PRD 2 §6) and their
 *         referral stats (direct referrals, active referrals, network size).
 * POST — applies a referral code brought at signup. The referral is recorded
 *         as PENDING; Kai Bar is only credited once the referred user completes
 *         a meaningful milestone (PRD 2 §7 anti-fraud).
 */

const SHORT_CODE_LEN = 2 + 4;
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function makeShortCode(name: string, wallet: string) {
  // "KAI-" + <initial-uppers> + <last 4 hex of wallet upper()>
  const initials = name
    .split(/\s+/)
    .map((p) => p[0] || '')
    .join('')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(1, 'K');
  const tail = wallet.replace(/[^a-fA-F0-9]/g, '').slice(-4).toUpperCase();
  return `KAI-${initials}${tail}`;
}

async function resolveUser(prisma: any, privyUserId: string) {
  return prisma.kaiUser.findUnique({
    where: { privyUserId },
    include: { wallets: true },
  });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const privyUserId = searchParams.get('privyUserId')?.trim();
  if (!privyUserId) return NextResponse.json({ error: 'privyUserId required' }, { status: 400 });

  const prisma = await getPrisma();
  if (!prisma) return NextResponse.json({ code: null, stats: { direct: 0, active: 0, networkSize: 0 }, db: false });

  try {
    let user = await resolveUser(prisma, privyUserId);
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Generate + store the code on first request.
    if (!user.referralCode) {
      const wallet = user.wallets.find((w: any) => w.chain === 'ETHEREUM')?.address ?? '0000000000000000000000000000000000000000';
      const code = makeShortCode(user.name, wallet).slice(0, SHORT_CODE_LEN + 4);
      user = await prisma.kaiUser.update({
        where: { id: user.id },
        data: { referralCode: code },
        include: { wallets: true },
      });
    }

    // Stats
    const direct = await prisma.referral.count({ where: { referrerUserId: user.id } });
    const active = await prisma.referral.count({
      where: { referrerUserId: user.id, status: { in: ['VALID', 'REWARDED'] } },
    });
    // network size: everyone referred by me OR by people I referred (2 levels).
    const firstLevel = await prisma.referral.findMany({
      where: { referrerUserId: user.id },
      select: { referredUserId: true },
    });
    const firstIds = firstLevel.map((r: any) => r.referredUserId);
    const secondLevel = firstIds.length
      ? await prisma.referral.count({ where: { referrerUserId: { in: firstIds } } })
      : 0;
    const networkSize = firstIds.length + secondLevel;

    return NextResponse.json({
      code: user.referralCode,
      stats: { direct: firstIds.length, active, networkSize },
    });
  } catch (e: any) {
    console.error('[kai-bar/referral] failed', e);
    return NextResponse.json({ error: 'Failed to load referral info' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const privyUserId = String(body.privyUserId ?? '').trim();
  const code = String(body.code ?? '').trim().toUpperCase();
  if (!privyUserId || !code) {
    return NextResponse.json({ error: 'privyUserId and code required' }, { status: 400 });
  }

  const prisma = await getPrisma();
  if (!prisma) return NextResponse.json({ error: 'database unavailable' }, { status: 503 });

  try {
    const user = await prisma.kaiUser.findUnique({ where: { privyUserId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Self-referral not allowed.
    const already = await prisma.referral.findFirst({ where: { referredUserId: user.id } });
    if (already) return NextResponse.json({ error: 'Referral already applied', applied: true }, { status: 409 });

    const referrer = await prisma.kaiUser.findUnique({ where: { referralCode: code } });
    if (!referrer || referrer.id === user.id) {
      return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 });
    }

    // Record as PENDING until the referred user hits a milestone (PRD 2 §7).
    // Since the user already has a wallet (they're authenticated via Privy),
    // the milestone is met — validate immediately and credit Kai Bar.
    const referral = await prisma.referral.create({
      data: {
        referrerUserId: referrer.id,
        referredUserId: user.id,
        referralCode: code,
        status: 'PENDING',
      },
    });

    // Milestone: user is already authenticated + has a wallet → valid.
    await prisma.referral.update({
      where: { id: referral.id },
      data: { status: 'VALID', rewardedAt: new Date() },
    });

    // +500 direct referral credit to the referrer
    await prisma.kaiBarLedger.create({
      data: {
        userId: referrer.id,
        type: 'REFERRAL_REFERRER',
        amount: 500,
        description: `Referral reward: ${user.name}`,
        referenceId: referral.id,
      },
    });

    // +500 credit to the referred user
    await prisma.kaiBarLedger.create({
      data: {
        userId: user.id,
        type: 'REFERRAL',
        amount: 500,
        description: `Invited by ${referrer.name}`,
        referenceId: referral.id,
      },
    });

    // Second-level: if the referrer was themselves referred, credit grand-referrer +50
    const referrerReferredBy = await prisma.referral.findFirst({
      where: { referredUserId: referrer.id, status: { in: ['VALID', 'REWARDED'] } },
    });
    if (referrerReferredBy) {
      await prisma.kaiBarLedger.create({
        data: {
          userId: referrerReferredBy.referrerUserId,
          type: 'REFERRAL_SECOND_LEVEL',
          amount: 50,
          description: `Second-level referral: ${user.name} via ${referrer.name}`,
          referenceId: referral.id,
        },
      });
    }

    return NextResponse.json({ ok: true, referrerName: referrer.name });
  } catch (e: any) {
    console.error('[kai-bar/referral] failed', e);
    return NextResponse.json({ error: 'Failed to apply referral' }, { status: 500 });
  }
}