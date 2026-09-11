import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { AIRDROP_VAULT_ADDRESS } from '@/lib/addresses';

/**
 * /api/kai-bar/airdrop  —  GET
 *
 * Airdrop eligibility snapshot (PRD 2 §11). Tracks eligibility without
 * promising a fixed token amount. Scores are derived from the ledger:
 *   contributionScore — points from non-referral activity
 *   referralScore     — points from referrals (+ their second level)
 *   activityScore     — number of distinct earning events
 *
 * A user is "eligible" once they hold a positive balance and have not been
 * flagged by anti-abuse.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const privyUserId = searchParams.get('privyUserId')?.trim();
  if (!privyUserId) return NextResponse.json({ error: 'privyUserId required' }, { status: 400 });

  const prisma = await getPrisma();
  if (!prisma) return NextResponse.json({ eligible: false, db: false });

  try {
    const user = await prisma.kaiUser.findUnique({
      where: { privyUserId },
      include: { airdropEligibility: true },
    });
    if (!user) return NextResponse.json({ eligible: false, exists: false });

    const ledger = await prisma.kaiBarLedger.findMany({ where: { userId: user.id } });
    const kaiBar = ledger.reduce((sum, e) => sum + e.amount, 0);

    const referral = ledger
      .filter((e) => ['REFERRAL', 'REFERRAL_REFERRER', 'REFERRAL_SECOND_LEVEL'].includes(e.type))
      .reduce((sum, e) => sum + e.amount, 0);
    const contribution = kaiBar - referral;
    const activityScore = ledger.length * 100;

    const eligible = kaiBar > 0 && user.status === 'NORMAL';

    // Persist snapshot for admin inspection.
    await prisma.airdropEligibility.upsert({
      where: { userId: user.id },
      update: { eligible, contributionScore: contribution, referralScore: referral, activityScore },
      create: { userId: user.id, eligible, contributionScore: contribution, referralScore: referral, activityScore },
    });

    return NextResponse.json({
      eligible,
      kaiBar,
      contributionScore: contribution,
      referralScore: referral,
      activityScore,
      status: user.status,
      onChain: AIRDROP_VAULT_ADDRESS ? { vault: AIRDROP_VAULT_ADDRESS } : null,
    });
  } catch (e: any) {
    console.error('[kai-bar/airdrop] failed', e);
    return NextResponse.json({ error: 'Failed to load airdrop status' }, { status: 500 });
  }
}