import { NextResponse } from 'next/server';
import { REGISTRY_ADDRESS } from '@/lib/addresses';

export async function GET() {
  const data = {
    chama: {
      id: 'chama-001',
      groupName: 'Mwanzo Mpya Women Savings Chama',
      registrationNumber: 'SS/NGO/2021/4821',
      cyclePeriodDays: 30,
      contributionAmount: 2_000,
      totalPoolBalanceKes: 284_000,
      yieldAllocatedKes: 34_820,
      activeVaultStrategy: 'BALANCED_YBOB_VAULT',
      groupWallet: REGISTRY_ADDRESS ?? '0x36C42829BF7e48cCF738f0632456ECE63ABEA2ED',
    },
    stats: {
      totalMembers: 24,
      totalPoolKes: 284_000,
      yieldEarnedKes: 34_820,
      bestApyPercent: 22.0,
      activePools: 3,
      cycleNumber: 18,
      nextPayoutDays: 12,
    },
    members: [
      { id: 'cm1', name: 'Wanjiru Kamau',   role: 'CHAIRPERSON', totalContributed: 36_000, sharePercent: 12.7, phone: '+2547…01' },
      { id: 'cm2', name: 'Akinyi Odhiambo', role: 'TREASURER',   totalContributed: 34_000, sharePercent: 12.0, phone: '+2547…02' },
      { id: 'cm3', name: 'Beatrice Mutua',  role: 'SECRETARY',   totalContributed: 30_000, sharePercent: 10.6, phone: '+2547…03' },
      { id: 'cm4', name: 'Faith Njeri',     role: 'MEMBER',      totalContributed: 28_000, sharePercent: 9.9,  phone: '+2547…04' },
      { id: 'cm5', name: 'Halima Yusuf',    role: 'MEMBER',      totalContributed: 26_000, sharePercent: 9.2,  phone: '+2547…05' },
      { id: 'cm6', name: 'Jane Cherotich',  role: 'MEMBER',      totalContributed: 24_000, sharePercent: 8.5,  phone: '+2547…06' },
    ],
    recentContributions: [
      { memberName: 'Wanjiru Kamau',   amountKes: 2_000, paymentRef: 'QJK7823NX', status: 'SUCCESS', timestamp: '2026-08-29T08:00:00Z' },
      { memberName: 'Akinyi Odhiambo', amountKes: 2_000, paymentRef: 'QJK7824NY', status: 'SUCCESS', timestamp: '2026-08-28T09:15:00Z' },
      { memberName: 'Beatrice Mutua',  amountKes: 2_000, paymentRef: 'QJK7825NZ', status: 'SUCCESS', timestamp: '2026-08-27T10:30:00Z' },
      { memberName: 'Faith Njeri',     amountKes: 2_000, paymentRef: 'QJK7826NA', status: 'PENDING', timestamp: '2026-08-27T11:00:00Z' },
      { memberName: 'Halima Yusuf',    amountKes: 2_000, paymentRef: 'QJK7827NB', status: 'SUCCESS', timestamp: '2026-08-26T14:00:00Z' },
    ],
    yieldLogs: [
      { id: 'y1', amountInvested: 200_000, yieldEarnedKes: 12_600, strategyUsed: 'BALANCED_YBOB_VAULT',     txHash: '0xabc…001', generatedAt: '2026-08-01' },
      { id: 'y2', amountInvested: 230_000, yieldEarnedKes: 13_800, strategyUsed: 'BALANCED_YBOB_VAULT',     txHash: '0xabc…002', generatedAt: '2026-07-01' },
      { id: 'y3', amountInvested: 180_000, yieldEarnedKes: 8_420,  strategyUsed: 'CONSERVATIVE_KES_STABLE', txHash: '0xabc…003', generatedAt: '2026-06-01' },
    ],
    vaultStrategies: [
      { key: 'CONSERVATIVE_KES_STABLE', label: 'Conservative KES',  apy: 12, risk: 'Very Low', color: '#22c55e', token: 'yBOB',   desc: 'Stable KES vault - low volatility'             },
      { key: 'BALANCED_YBOB_VAULT',     label: 'Balanced yBOB',     apy: 18, risk: 'Low',      color: '#3b82f6', token: 'yBOB',   desc: '18% APY yBOB yield pool - active strategy'    },
      { key: 'HIGH_YIELD_ETH_POOL',    label: 'High Yield ETH',   apy: 24, risk: 'Medium',   color: '#e84142', token: 'GAMI',   desc: '24% APY Ethereum & Hedera liquidity pool'              },
    ],
    pools: [
      { name: 'NVR / yBOB',     icon: '', apy: '~3.0%',  tvl: '1,000 NVR',   members: 24, color: '#e84142' },
      { name: 'YTOKEN / YGOLD', icon: '', apy: '~6.0%',  tvl: '500 YTOKEN',  members: 15, color: '#a855f7' },
      { name: 'GAMI / CENTS',   icon: '', apy: '~9.0%',  tvl: '5,000 GAMI',  members: 38, color: '#22c55e' },
    ],
    monthlyYield: [
      { month: 'Mar', yieldKes: 8_200  },
      { month: 'Apr', yieldKes: 9_400  },
      { month: 'May', yieldKes: 10_100 },
      { month: 'Jun', yieldKes: 8_420  },
      { month: 'Jul', yieldKes: 13_800 },
      { month: 'Aug', yieldKes: 12_600 },
    ],
  };

  return NextResponse.json(data);
}
