import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

type KaiUserWithWallets = Prisma.KaiUserGetPayload<{ include: { wallets: true } }>;

/**
 * /api/kai-bar/onboard  —  POST
 *
 * Called once after a successful Google login + embedded-wallet creation
 * (PRD 1 & 2 handoff). Links the Privy user id to a Kainovari KaiUser,
 * records their Ethereum & Hedera wallet address (never any key), and credits the
 * +1,000 WELCOME_BONUS through the append-only Kai Bar ledger.
 *
 * Also accepts an optional `referralCode` captured at signup and records the
 * referral as PENDING (PRD 2 §7 — a referral is only rewarded later, once the
 * referred user completes a meaningful milestone).
 *
 * Idempotent: running it twice for the same Privy user is a no-op that just
 * returns the existing record.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const privyUserId = String(body.privyUserId ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim();
  const address = String(body.address ?? '').trim();

  if (!privyUserId || !email || !name) {
    return NextResponse.json({ error: 'privyUserId, email and name required' }, { status: 400 });
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'A valid wallet address is required' }, { status: 400 });
  }

  const prisma = await getPrisma();
  if (!prisma) return NextResponse.json({ error: 'database unavailable' }, { status: 503 });

  const referralCode = String(body.referralCode ?? '').trim().toUpperCase() || null;

  try {
    // ── idempotent: reuse an existing user for this Privy id / email ──
    let user: KaiUserWithWallets | null = await prisma.kaiUser.findFirst({
      where: { OR: [{ privyUserId }, { email }] },
      include: { wallets: true },
    });

    let isNew = false;
    if (!user) {
      user = await prisma.kaiUser.create({
        data: { name, email, privyUserId },
        include: { wallets: true },
      });
      isNew = true;
    }

    // ── persist the wallet (create or update address) ──
    const existingWallet = user.wallets.find((w) => w.chain === 'ETHEREUM');
    let wallet = existingWallet;
    if (!existingWallet) {
      wallet = await prisma.kaiWallet.create({
        data: { userId: user.id, chain: 'ETHEREUM', address },
      });
    } else if (existingWallet.address !== address) {
      wallet = await prisma.kaiWallet.update({
        where: { id: existingWallet.id },
        data: { address },
      });
    }

    // ── +1000 WELCOME_BONUS exactly once ──
    if (isNew) {
      await prisma.kaiBarLedger.create({
        data: {
          userId: user.id,
          type: 'WELCOME_BONUS',
          amount: 1000,
          description: 'Welcome bonus',
          referenceId: 'onboarding',
        },
      });
    }

    // ── apply a signup referral code (PENDING, anti-fraud gated) ──
    let referralApplied = false;
    let referrerName: string | null = null;
    if (referralCode) {
      const alreadyReferred = await prisma.referral.findFirst({
        where: { referredUserId: user.id },
      });
      if (!alreadyReferred) {
        // user must not redeem their own code
        const referrer = await prisma.kaiUser.findUnique({
          where: { referralCode },
        });
        if (referrer && referrer.id !== user.id) {
          const referral = await prisma.referral.create({
            data: {
              referrerUserId: referrer.id,
              referredUserId: user.id,
              referralCode,
              status: 'PENDING',
            },
          });
          referralApplied = true;
          referrerName = referrer.name;

          // ── milestone trigger: validate referral + credit Kai Bar (PRD 2 §7) ──
          // The referred user now has a wallet + account — that's the "meaningful
          // milestone" required before a referral is reward-eligible.
          if (isNew) {
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
                description: `Referral reward: ${name || email}`,
                referenceId: referral.id,
              },
            });

            // +500 credit to the referred user (the invitee gets points too)
            await prisma.kaiBarLedger.create({
              data: {
                userId: user.id,
                type: 'REFERRAL',
                amount: 500,
                description: `Invited by ${referrer.name}`,
                referenceId: referral.id,
              },
            });

            // ── second-level referral: if the referrer was themselves referred, ──
            // credit the referrer's referrer +50 (PRD 2 §8).
            const referrerReferredBy = await prisma.referral.findFirst({
              where: { referredUserId: referrer.id, status: { in: ['VALID', 'REWARDED'] } },
            });
            if (referrerReferredBy) {
              const grandReferrer = await prisma.kaiUser.findUnique({
                where: { id: referrerReferredBy.referrerUserId },
              });
              if (grandReferrer) {
                await prisma.kaiBarLedger.create({
                  data: {
                    userId: grandReferrer.id,
                    type: 'REFERRAL_SECOND_LEVEL',
                    amount: 50,
                    description: `Second-level referral: ${name || email} via ${referrer.name}`,
                    referenceId: referral.id,
                  },
                });
              }
            }
          }
        }
      }
    }

    // ── also validate any existing PENDING referrals for returning users ──
    // (idempotent — only processes once per referral)
    if (!isNew) {
      const pendingReferrals = await prisma.referral.findMany({
        where: { referredUserId: user.id, status: 'PENDING' },
      });
      for (const ref of pendingReferrals) {
        await prisma.referral.update({
          where: { id: ref.id },
          data: { status: 'VALID', rewardedAt: new Date() },
        });

        // Credit the referrer
        await prisma.kaiBarLedger.create({
          data: {
            userId: ref.referrerUserId,
            type: 'REFERRAL_REFERRER',
            amount: 500,
            description: `Referral reward: ${name || email}`,
            referenceId: ref.id,
          },
        });

        // Credit the referred user
        await prisma.kaiBarLedger.create({
          data: {
            userId: user.id,
            type: 'REFERRAL',
            amount: 500,
            description: `Invited by referrer`,
            referenceId: ref.id,
          },
        });

        // Second-level: credit grand-referrer if exists
        const referrerReferredBy = await prisma.referral.findFirst({
          where: { referredUserId: ref.referrerUserId, status: { in: ['VALID', 'REWARDED'] } },
        });
        if (referrerReferredBy) {
          await prisma.kaiBarLedger.create({
            data: {
              userId: referrerReferredBy.referrerUserId,
              type: 'REFERRAL_SECOND_LEVEL',
              amount: 50,
              description: `Second-level referral: ${name || email}`,
              referenceId: ref.id,
            },
          });
        }
      }
    }

    // ── mark the SIGNUP task complete + credit it on the ledger ──
    // The +1000 welcome bonus already covers the SIGNUP task reward, so the
    // SIGNUP task here is simply recorded as completed to avoid double credit.
    const signupTask = await prisma.rewardTask.findFirst({
      where: { taskType: 'SIGNUP', active: true },
    });
    if (signupTask) {
      const done = await prisma.taskCompletion.findUnique({
        where: { userId_taskId: { userId: user.id, taskId: signupTask.id } },
      });
      if (!done) {
        await prisma.taskCompletion.create({
          data: { userId: user.id, taskId: signupTask.id },
        });
      }
    }

    // ── record onboarding event in the audit trail ──
    const activityModel = (prisma as any).activity;
    if (activityModel) {
      try {
        await activityModel.create({
          data: { userId: user.authUserId!, type: 'WALLET_CREATED', description: 'Privy wallet onboarded' },
        });
      } catch {
        /* audit trail is best-effort */
      }
    }

    return NextResponse.json({
      ok: true,
      isNew,
      userId: user.id,
      wallet,
      kaiBar: isNew ? 1000 : 0,
      referralApplied,
      referrerName,
      status: user.status,
    });
  } catch (e) {
    console.error('[kai-bar/onboard] failed', e);
    return NextResponse.json({ error: 'Failed to onboard user' }, { status: 500 });
  }
}
