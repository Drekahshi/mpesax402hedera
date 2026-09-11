import { NextResponse } from 'next/server';

// Returns the community hub feed.
// Extend with real DB queries once prisma/schema.prisma ContentPost model is migrated.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get('category') ?? 'ALL';
  const q        = (searchParams.get('q') ?? '').toLowerCase();

  // The seed data lives in the page component for SSR speed.
  // This route is the real data layer — return empty so the page uses seeds.
  return NextResponse.json({ posts: [], category, q, note: 'Connect prisma to populate' });
}
