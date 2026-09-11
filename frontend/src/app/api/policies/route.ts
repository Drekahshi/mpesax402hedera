import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type PolicyRecord = {
  policyId: string;
  serviceType: string;
  owner: string;
  config: Record<string, unknown>;
  paymentAmount: number;
  paymentTxHash?: string;
  status: "draft" | "active";
  createdAt: string;
};

type PolicyStore = { policies: PolicyRecord[] };
const globalForPolicies = globalThis as typeof globalThis & { kaiPolicyStore?: PolicyStore };
const store = globalForPolicies.kaiPolicyStore ?? { policies: [] };
globalForPolicies.kaiPolicyStore = store;

export async function GET() {
  return NextResponse.json({ policies: store.policies });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.owner || !body.serviceType || !body.config) {
      return NextResponse.json({ error: "owner, serviceType, and config are required" }, { status: 400 });
    }

    const policy: PolicyRecord = {
      policyId: `pol_${crypto.randomUUID().slice(0, 8)}`,
      serviceType: String(body.serviceType),
      owner: String(body.owner),
      config: body.config,
      paymentAmount: Number(body.paymentAmount || 0),
      paymentTxHash: body.paymentTxHash ? String(body.paymentTxHash) : undefined,
      status: "draft",
      createdAt: new Date().toISOString(),
    };
    store.policies.unshift(policy);
    return NextResponse.json({ policy }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid policy request" }, { status: 400 });
  }
}
