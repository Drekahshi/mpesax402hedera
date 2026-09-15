import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

/**
 * /api/kai/session  —  POST
 *
 * Links a Privy user + embedded Ethereum & Hedera wallet to a Kainovari account.
 * This implements the PRD 1 §5 three-way mapping:
 *     Privy User ID  +  Kainovari User ID  +  Wallet Address
 *
 * On first-ever login it also:
 *   - creates the KaiUser
 *   - creates the ETHEREUM KaiWallet
 *   - credits the +1000 Kai Bar welcome bonus (PRD 2 §5)
 *   - consumes a referral code if one was supplied (PRD 2 §6–7)
 *
 * Hard rule: this endpoint never receives or stores private keys — only the
 * embedded wallet's public address.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const privyUserId = String(body.privyUserId ?? '').trim();
  const walletAddress = String(body.walletAddress ?? '').toLowerCase().trim();
  const referralCode = body.referralCode ? String(body.referralCode).trim().toUpperCase() : null;

  if (!privyUserId || !walletAddress) {
    return NextResponse.json({ error: 'privyUserId and walletAddress are required' }, { status: 400 });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
    return NextResponse.json({ error: 'Invalid wallet address' }, { status: 400 });
  }

  const prisma = await getPrisma();
  if (!prisma) {
    // No DATABASE_URL (dev/preview) — still report success so the UI flows.
    return NextResponse.json({ ok: true, error: 'database-unavailable' });
  }

  try {
    // ── 1. Find or create the Kainovari user by Privy ID ──
    const existing = await prisma.kaiUser.findUnique({
      where: { privyUserId },
      include: { wallets: true },
    });

    const name = body.name ? String(body.name) : 'KAI Member';
    const email = body.email ? String(body.email) : undefined;

    let user = existing;
    let isNew = false;

    if (existing) {
      // Ensure the wallet is recorded/linked.
      const hasWallet = existing.wallets.some(
        (w) => w.chain === 'ETHEREUM' && w.address.toLowerCase() === walletAddress,
      );
      if (!hasWallet) {
        await prisma.kaiWallet.create({
          data: { userId: existing.id, chain: 'ETHEREUM', address: walletAddress },
        });
      }
    } else {
      isNew = true;
      user = await prisma.kaiUser.create({
        data: {
          name,
          email: email ?? `${walletAddress.slice(2, 10)}@kai.local`,
          privyUserId,
          status: 'NORMAL',
          wallets: {
            create: [{ chain: 'ETHEREUM', address: walletAddress }],
          },
        },
        include: { wallets: true },
      });
    }

    if (!user) throw new Error('Could not resolve user');

    // ── 2. Welcome bonus (only for brand-new users) ──
    if (isNew) {
      await prisma.kaiBarLedger.create({
        data: {
          userId: user.id,
          type: 'WELCOME_BONUS',
          amount: 1000,
          description: 'Welcome bonus',
          referenceId: `welcome-${user.id}`,
        },
      });
    }

    // ── 3. Consume referral code (only on signup) ──
    let referralApplied = false;
    if (isNew && referralCode) {
      const referrer = await prisma.kaiUser.findFirst({
        where: { sentReferrals: { some: { referralCode } } },
      });
      if (referrer && referrer.id !== user.id) {
        // Record the referral as PENDING until the referred user verifies /
        // completes a meaningful milestone (PRD 2 §7 anti-fraud).
        await prisma.referral.create({
          data: {
            referrerUserId: referrer.id,
            referredUserId: user.id,
            referralCode,
            status: 'PENDING',
          },
        });
        referralApplied = true;
      }
    }

    // ── 4. Compute Kai Bar balance from the ledger ──
    const ledger = await prisma.kaiBarLedger.findMany({
      where: { userId: user.id },
      select: { amount: true },
    });
    const kaiBar = ledger.reduce((sum, e) => sum + e.amount, 0);

    return NextResponse.json({
      ok: true,
      isNew,
      user: { id: user.id, name: user.name, email: user.email },
      wallet: { address: walletAddress, chain: 'ETHEREUM' },
      kaiBar,
      referralApplied,
      referralCode,
    });
  } catch (e) {
    console.error('[kai/session] failed', e);
    return NextResponse.json({ error: 'Failed to link account' }, { status: 500 });
  }
}
