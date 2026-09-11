import { NextResponse } from 'next/server';
import { getPrisma } from '@/lib/db';

/**
 * /api/kai-bar/tasks  —  GET
 *
 * Lists active reward tasks (PRD 2 §9) plus which ones the requesting user
 * has already completed (marked with a check in the dashboard).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const privyUserId = searchParams.get('privyUserId')?.trim();
  const prisma = await getPrisma();
  if (!prisma) return NextResponse.json({ tasks: [], db: false });

  try {
    const user = privyUserId
      ? await prisma.kaiUser.findUnique({ where: { privyUserId } })
      : null;

    const tasks = await prisma.rewardTask.findMany({
      where: { active: true },
      orderBy: [{ taskType: 'asc' }],
    });

    const completed = user
      ? await prisma.taskCompletion.findMany({
          where: { userId: user.id },
          select: { taskId: true },
        })
      : [];
    const completedIds = new Set(completed.map((c) => c.taskId));

    return NextResponse.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        rewardAmount: t.rewardAmount,
        taskType: t.taskType,
        maxCompletions: t.maxCompletions,
        completed: completedIds.has(t.id),
      })),
    });
  } catch (e: any) {
    console.error('[kai-bar/tasks] failed', e);
    return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 });
  }
}