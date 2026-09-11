import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

/**
 * /api/kai-bar/tasks/complete  —  POST
 *
 * Marks a reward task complete and credits the reward to the Kai Bar ledger.
 * Guards against repeat completion (PRD 2 §13 anti-abuse) and respects
 * maxCompletions.
 */
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const privyUserId = String(body.privyUserId ?? '').trim();
  const taskId = String(body.taskId ?? '').trim();
  if (!privyUserId || !taskId) {
    return NextResponse.json({ error: 'privyUserId and taskId required' }, { status: 400 });
  }

  const prisma = await getPrisma();
  if (!prisma) return NextResponse.json({ error: 'database unavailable' }, { status: 503 });

  try {
    const user = await prisma.kaiUser.findUnique({ where: { privyUserId } });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (user.status === 'BLOCKED') {
      return NextResponse.json({ error: 'Account blocked' }, { status: 403 });
    }

    const task = await prisma.rewardTask.findUnique({ where: { id: taskId } });
    if (!task || !task.active) {
      return NextResponse.json({ error: 'Task not available' }, { status: 404 });
    }

    // ── repeat guard ──
    const existing = await prisma.taskCompletion.findUnique({
      where: { userId_taskId: { userId: user.id, taskId } },
    });
    if (existing) {
      return NextResponse.json({ error: 'Task already completed', already: true }, { status: 409 });
    }
    if (task.maxCompletions) {
      const count = await prisma.taskCompletion.count({ where: { taskId } });
      if (count >= task.maxCompletions) {
        return NextResponse.json({ error: 'Task no longer available' }, { status: 409 });
      }
    }

    // ── record completion + ledger credit (atomic) ──
    const [, ledger] = await prisma.$transaction([
      prisma.taskCompletion.create({
        data: { userId: user.id, taskId },
      }),
      prisma.kaiBarLedger.create({
        data: {
          userId: user.id,
          type: 'TASK',
          amount: task.rewardAmount,
          description: task.name,
          referenceId: taskId,
        },
      }),
    ]);

    return NextResponse.json({ ok: true, earned: task.rewardAmount, entry: ledger.id });
  } catch (e: any) {
    console.error('[kai-bar/tasks/complete] failed', e);
    return NextResponse.json({ error: 'Failed to complete task' }, { status: 500 });
  }
}