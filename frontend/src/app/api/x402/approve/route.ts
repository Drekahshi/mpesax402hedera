/**
 * /api/x402/approve
 *
 * Owner-only endpoint for approving or rejecting pending x402 payments.
 *
 * GET  ?wallet=0x…  → list pending payments for the owner wallet
 * POST { id, action: 'approve'|'reject', wallet }  → update status
 *
 * In production this would write to Neon DB. For now, an in-memory store
 * gives full functionality without a DB connection.
 */

import { NextResponse } from 'next/server';
import { walletAddress } from '@/lib/addresses';

const OWNER = walletAddress(process.env.WALLET_ADDRESS)?.toLowerCase() ?? '';

export interface PendingPayment {
  id: string;
  route: string;
  payer: string;
  amount: number;
  symbol: string;
  service: string;
  requestedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  paymentHeader?: string;
  nonce: string;
}

// ── In-memory store ─────────────────────────────────────────────────────────
export const pendingPayments = new Map<string, PendingPayment>();

// Seed a few demo payments so the UI is not empty
const demos: PendingPayment[] = [
  { id: 'x402-001', route: '/agents/tx/analyse',       payer: '0x1234…abcd', amount: 100,  symbol: 'CENTS', service: 'TX Analyst',       requestedAt: new Date(Date.now() - 300_000).toISOString(), status: 'pending', nonce: '0xabc001', paymentHeader: '' },
  { id: 'x402-002', route: '/agents/audit',            payer: '0x5678…ef12', amount: 500,  symbol: 'CENTS', service: 'Contract Auditor',  requestedAt: new Date(Date.now() - 120_000).toISOString(), status: 'pending', nonce: '0xabc002', paymentHeader: '' },
  { id: 'x402-003', route: '/agents/codegen/generate', payer: '0x9abc…3456', amount: 1000, symbol: 'CENTS', service: 'Code Generator',    requestedAt: new Date(Date.now() -  60_000).toISOString(), status: 'pending', nonce: '0xabc003', paymentHeader: '' },
];
demos.forEach(d => pendingPayments.set(d.id, d));

// ── Auth guard ──────────────────────────────────────────────────────────────
function isOwner(req: Request) {
  const w = req.headers.get('x-wallet-address') ?? '';
  return w.toLowerCase() === OWNER;
}

// ── GET ─────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  if (!isOwner(req)) {
    return NextResponse.json({ error: 'Owner wallet required' }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status') ?? 'all';

  const all = Array.from(pendingPayments.values()).sort(
    (a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()
  );
  const filtered = statusFilter === 'all' ? all : all.filter(p => p.status === statusFilter);

  return NextResponse.json({
    payments: filtered,
    summary: {
      pending:  all.filter(p => p.status === 'pending').length,
      approved: all.filter(p => p.status === 'approved').length,
      rejected: all.filter(p => p.status === 'rejected').length,
      total:    all.length,
    },
  });
}

// ── POST ────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  if (!isOwner(req)) {
    return NextResponse.json({ error: 'Owner wallet required' }, { status: 403 });
  }

  const body = await req.json();
  const { id, action } = body as { id: string; action: 'approve' | 'reject' };

  if (!id || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'id and action (approve|reject) required' }, { status: 400 });
  }

  const payment = pendingPayments.get(id);
  if (!payment) {
    return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
  }

  payment.status = action === 'approve' ? 'approved' : 'rejected';
  pendingPayments.set(id, payment);

  // If approved, forward the payment header to the agent backend
  if (action === 'approve' && payment.paymentHeader) {
    try {
      await fetch(`${process.env.RAG_API_URL ?? 'http://localhost:8000'}${payment.route}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-PAYMENT': payment.paymentHeader,
          'X-Wallet-Address': payment.payer,
          'X-Owner-Approved': 'true',
        },
        body: JSON.stringify({ approved: true }),
        signal: AbortSignal.timeout(5000),
      }).catch(() => {});
    } catch { /* non-fatal */ }
  }

  return NextResponse.json({ ok: true, payment });
}

// ── External helper: register a new pending payment ─────────────────────────
export function registerPendingPayment(p: Omit<PendingPayment, 'id' | 'requestedAt' | 'status'>) {
  const id = `x402-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const entry: PendingPayment = { ...p, id, requestedAt: new Date().toISOString(), status: 'pending' };
  pendingPayments.set(id, entry);
  return entry;
}
