import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

/**
 * /api/kai-bar/ledger  —  GET
 *
 * Returns a user's Kai Bar balance (computed from the append-only ledger,
 * PRD 2 §4) plus the recent ledger history.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const privyUserId = searchParams.get('privyUserId')?.trim();

  if (!privyUserId) return NextResponse.json({ error: 'privyUserId required' }, { status: 400 });

  const prisma = await getPrisma();
  if (!prisma) return NextResponse.json({ kaiBar: 0, entries: [], db: false });

  try {
    const user = await prisma.kaiUser.findUnique({
      where: { privyUserId },
      select: { id: true, status: true },
    });
    if (!user) return NextResponse.json({ kaiBar: 0, entries: [], exists: false });

    const entries = await prisma.kaiBarLedger.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    const kaiBar = entries.reduce((sum, e) => sum + e.amount, 0);

    return NextResponse.json({
      userId: user.id,
      status: user.status,
      kaiBar,
      entries: entries.map((e) => ({
        id: e.id,
        type: e.type,
        amount: e.amount,
        description: e.description,
        referenceId: e.referenceId,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  } catch (e: any) {
    console.error('[kai-bar/ledger] failed', e);
    return NextResponse.json({ error: 'Failed to load ledger' }, { status: 500 });
  }
}
