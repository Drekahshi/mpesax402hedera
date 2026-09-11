/**
 * x402 Facilitator client for micropayments, agent policy rails, and Hedera settlement.
 */
export const X402_FACILITATOR_URL =
  process.env.X402_FACILITATOR_URL ||
  process.env.NEXT_PUBLIC_X402_FACILITATOR_URL ||
  'https://x402-hedera-production.up.railway.app';

export interface X402PaymentRequest {
  resource: string;
  price: string;
  token: string;
  payTo: string;
  network?: string;
  metadata?: Record<string, unknown>;
}

export interface X402PaymentProof {
  txHash: string;
  payer: string;
  amount: string;
  timestamp: number;
}

export class X402Client {
  private facilitatorUrl: string;

  constructor(facilitatorUrl: string = X402_FACILITATOR_URL) {
    this.facilitatorUrl = facilitatorUrl.replace(/\/$/, '');
  }

  /**
   * Request an x402 payment challenge for a protected resource
   */
  async requestPaymentChallenge(resourcePath: string): Promise<X402PaymentRequest> {
    const res = await fetch(`${this.facilitatorUrl}/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource: resourcePath }),
    });

    if (!res.ok) {
      throw new Error(`Failed to obtain x402 challenge: ${res.statusText}`);
    }

    return res.json();
  }

  /**
   * Verify and settle payment proof with facilitator
   */
  async verifyPayment(proof: X402PaymentProof): Promise<{ valid: boolean; token?: string }> {
    const res = await fetch(`${this.facilitatorUrl}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(proof),
    });

    if (!res.ok) {
      throw new Error(`Payment verification failed: ${res.statusText}`);
    }

    return res.json();
  }

  /**
   * Health check for x402 facilitator
   */
  async health(): Promise<{ status: string }> {
    const res = await fetch(`${this.facilitatorUrl}/health`);
    return res.json();
  }
}

export const x402Client = new X402Client();
