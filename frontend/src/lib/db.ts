import { prisma } from '@/lib/prisma';

/**
 * Shared DB accessor for API routes.
 * Returns `null` when no DATABASE_URL is configured (dev / preview), so
 * routes can degrade gracefully instead of throwing on import.
 */
export async function getPrisma() {
  if (!process.env.DATABASE_URL) return null;
  return prisma;
}
