import { NextResponse } from 'next/server';
import { VAULT_ADDRESSES } from '@/lib/addresses';

export async function GET() {
  const data = {
    business: {
      id: 'sme-001',
      businessName: 'Kipkelion Farm Supplies & Hardware',
      ownerName: 'Daniel Ruto',
      phoneNumber: '+254712345678',
      category: 'AGRI_SUPPLIES',
      location: 'Kipkelion, Kericho County',
      cashFlowScore: 74.5,
      creditLimit: 50_000,
      walletAddress: VAULT_ADDRESSES.yBOB ?? '0x431A98d42f9F7d6529C676115D5E3Df3c2419DA2',
    },
    stats: {
      totalIncomeKes: 284_600,
      totalExpenseKes: 192_300,
      netProfitKes: 92_300,
      creditGivenKes: 38_000,
      debtOwedKes: 14_500,
      cashFlowScore: 74.5,
      activeLoans: 1,
      activeCashFlowTokens: 2,
    },
    ledger: [
      { id: 'l1', type: 'INCOME',       amountKes: 45_000, counterparty: 'Nairobi Seed Co.',     description: 'Maize seed batch sale',        categoryTag: 'Sales',     paymentMethod: 'MPESA',   timestamp: '2026-08-29T09:00:00Z' },
      { id: 'l2', type: 'EXPENSE',      amountKes: 18_000, counterparty: 'Eldoret Wholesalers',  description: 'DAP Fertiliser restocking',     categoryTag: 'Inventory', paymentMethod: 'BANK',    timestamp: '2026-08-28T14:30:00Z' },
      { id: 'l3', type: 'INCOME',       amountKes: 12_500, counterparty: 'KCA Hardware Ltd',     description: 'Nails & roofing sheets sale',   categoryTag: 'Sales',     paymentMethod: 'CASH',    timestamp: '2026-08-28T11:00:00Z' },
      { id: 'l4', type: 'CREDIT_GIVEN', amountKes: 8_000,  counterparty: 'Mwamba Farm Group',    description: 'Seeds on 30-day credit',        categoryTag: 'Credit',    paymentMethod: 'MPESA',   timestamp: '2026-08-27T16:00:00Z' },
      { id: 'l5', type: 'EXPENSE',      amountKes: 5_500,  counterparty: 'Kenya Power',          description: 'Monthly electricity bill',      categoryTag: 'Utilities', paymentMethod: 'MPESA',   timestamp: '2026-08-26T08:30:00Z' },
      { id: 'l6', type: 'INCOME',       amountKes: 32_000, counterparty: 'Retail Walk-ins',      description: 'POS daily retail sales',        categoryTag: 'Sales',     paymentMethod: 'CASH',    timestamp: '2026-08-25T18:00:00Z' },
      { id: 'l7', type: 'DEBT_OWED',    amountKes: 14_500, counterparty: 'Simlaw Seeds Kenya',   description: 'Hybrid seed stock on credit',   categoryTag: 'Debt',      paymentMethod: 'PENDING', timestamp: '2026-08-24T10:00:00Z' },
      { id: 'l8', type: 'INCOME',       amountKes: 9_600,  counterparty: 'Chama Bulk Order',     description: 'Women group fertiliser order',  categoryTag: 'Sales',     paymentMethod: 'yBOB',    timestamp: '2026-08-23T12:00:00Z' },
    ],
    cashFlowTokens: [
      { id: 't1', tokenRef: 'RWA-INV-2026-0041', invoiceAmountKes: 100_000, discountPriceKes: 92_000, debtorName: 'Uchumi Supermarket', maturityDate: '2026-10-15', status: 'FUNDED'            },
      { id: 't2', tokenRef: 'RWA-INV-2026-0042', invoiceAmountKes: 60_000,  discountPriceKes: 55_500, debtorName: 'Tuskys Retail',      maturityDate: '2026-11-01', status: 'LISTED_FOR_FUNDING' },
    ],
    monthlyFlow: [
      { month: 'Mar', income: 210_000, expense: 145_000 },
      { month: 'Apr', income: 245_000, expense: 162_000 },
      { month: 'May', income: 198_000, expense: 130_000 },
      { month: 'Jun', income: 267_000, expense: 178_000 },
      { month: 'Jul', income: 302_000, expense: 205_000 },
      { month: 'Aug', income: 284_600, expense: 192_300 },
    ],
    products: [
      { icon: '', name: 'Working Capital Loan',    rate: '8% p.a.',  token: 'yBOB',  status: 'Available', cap: 'KES 50K'  },
      { icon: '', name: 'Inventory Finance',       rate: '6% p.a.',  token: 'yBOB',  status: 'Available', cap: 'KES 20K'  },
      { icon: '', name: 'FX Settlement (KES/USD)', rate: '0.3%',     token: 'CENTS', status: 'Active',    cap: '-'        },
      { icon: '', name: 'Merchant yBOB Account',  rate: '7.5% APY', token: 'yBOB',  status: 'Active',    cap: 'Infinite' },
      { icon: '', name: 'Revenue-Based Finance',   rate: '12% p.a.', token: 'NVR',   status: 'Pending',   cap: 'KES 100K' },
    ],
  };

  return NextResponse.json(data);
}
