import { NextResponse } from 'next/server';
import { VAULT_ADDRESSES } from '@/lib/addresses';

// Returns rich mock data shaped exactly like the Prisma CFA schema.
// When a live DB is connected, replace the mock with prisma queries.
export async function GET() {
  const data = {
    forest: {
      id: 'cfa-001',
      name: 'Mau Forest Guardians Group A',
      did: 'did:kai:mau-forest-001',
      locationRegion: 'Rift Valley, Kenya',
      establishedAt: '2021-03-15',
      totalHectares: 1240,
      carbonCredits: 8420,
      treasuryWallet: VAULT_ADDRESSES.NVR ?? '0xCB6198228E27f2200C9093024fB31527E0a3B7c0',
    },
    stats: {
      totalMembers: 347,
      activeZones: 6,
      treesPlanted: 18_420,
      patrols30d: 142,
      carbonCreditsEarned: 8_420,
      treasuryTvlKes: 1_245_000,
      proposalsActive: 2,
    },
    members: [
      { id: 'm1', name: 'Grace Wangari',  role: 'ADMIN',     wallet: '0x1234…abcd', patrols: 34, joinedAt: '2021-04-01' },
      { id: 'm2', name: 'Joseph Kimani',  role: 'GUARDIAN',  wallet: '0x5678…ef12', patrols: 28, joinedAt: '2021-05-10' },
      { id: 'm3', name: 'Fatuma Hassan',  role: 'TREASURER', wallet: '0x9abc…3456', patrols: 19, joinedAt: '2021-06-22' },
      { id: 'm4', name: 'Peter Mwangi',   role: 'GUARDIAN',  wallet: null,          patrols: 41, joinedAt: '2022-01-08' },
      { id: 'm5', name: 'Agnes Chebet',   role: 'AUDITOR',   wallet: '0xdef0…7890', patrols: 16, joinedAt: '2022-03-15' },
    ],
    zones: [
      { id: 'z1', zoneName: 'Zone A — Core',       areaHa: 320, treeCount: 4200, status: 'PROTECTED'    },
      { id: 'z2', zoneName: 'Zone B — Buffer',      areaHa: 180, treeCount: 2100, status: 'ACTIVE'       },
      { id: 'z3', zoneName: 'Zone C — Regeneration',areaHa: 240, treeCount: 3800, status: 'RESTORED'     },
      { id: 'z4', zoneName: 'Zone D — Honey Belt',  areaHa: 160, treeCount: 1900, status: 'ACTIVE'       },
      { id: 'z5', zoneName: 'Zone E — Riverine',    areaHa: 200, treeCount: 2800, status: 'ACTIVE'       },
      { id: 'z6', zoneName: 'Zone F — Alert Zone',  areaHa: 140, treeCount: 1620, status: 'UNDER_THREAT' },
    ],
    recentPatrols: [
      { id: 'p1', memberName: 'Joseph Kimani', zone: 'Zone A', durationMins: 120, treesPlanted: 15, status: 'COMPLETED', patrolDate: '2026-08-28' },
      { id: 'p2', memberName: 'Grace Wangari', zone: 'Zone F', durationMins: 90,  treesPlanted: 0,  status: 'FLAGGED',   patrolDate: '2026-08-27', incidentType: 'Illegal logging detected' },
      { id: 'p3', memberName: 'Peter Mwangi',  zone: 'Zone C', durationMins: 150, treesPlanted: 30, status: 'COMPLETED', patrolDate: '2026-08-26' },
      { id: 'p4', memberName: 'Agnes Chebet',  zone: 'Zone B', durationMins: 75,  treesPlanted: 10, status: 'COMPLETED', patrolDate: '2026-08-25' },
      { id: 'p5', memberName: 'Fatuma Hassan', zone: 'Zone E', durationMins: 100, treesPlanted: 20, status: 'COMPLETED', patrolDate: '2026-08-24' },
    ],
    products: [
      { id: 'fp1', name: 'Forest Honey Reserve',    category: 'Apiculture',    apyPercent: 14.0, token: 'GAMI',  status: 'Active',  memberCount: 47, tvlKes: 320_000 },
      { id: 'fp2', name: 'Traditional Medicine',    category: 'Medicinal',     apyPercent: 16.0, token: 'GAMI',  status: 'Active',  memberCount: 23, tvlKes: 180_000 },
      { id: 'fp3', name: 'Heritage Seed Bank',      category: 'Agriculture',   apyPercent: 6.5,  token: 'NVR',   status: 'Active',  memberCount: 61, tvlKes: 410_000 },
      { id: 'fp4', name: 'Bark Cloth & Fibre Arts', category: 'Cultural',      apyPercent: 13.2, token: 'YGOLD', status: 'Pending', memberCount: 12, tvlKes: 95_000  },
      { id: 'fp5', name: 'Community Water Rights',  category: 'Water',         apyPercent: 5.8,  token: 'yBOB',  status: 'Active',  memberCount: 89, tvlKes: 560_000 },
      { id: 'fp6', name: 'Sustainable Charcoal',    category: 'Energy',        apyPercent: 12.3, token: 'YGOLD', status: 'Active',  memberCount: 34, tvlKes: 240_000 },
    ],
    proposals: [
      { id: 'g1', proposalRef: 'KIP-001', title: 'Increase Honey Reserve yield to 15%',  votesFor: 234, votesAgainst: 45,  status: 'ACTIVE',  deadline: '2026-09-01' },
      { id: 'g2', proposalRef: 'KIP-002', title: 'Add new Forest Ward — Karura',          votesFor: 156, votesAgainst: 12,  status: 'PASSED',  deadline: '2026-08-20' },
      { id: 'g3', proposalRef: 'KIP-003', title: 'Seed Bank expansion to Meru County',   votesFor: 89,  votesAgainst: 33,  status: 'ACTIVE',  deadline: '2026-09-05' },
    ],
    monthlyTrend: [
      { month: 'Mar', trees: 1200, patrols: 28 },
      { month: 'Apr', trees: 1850, patrols: 34 },
      { month: 'May', trees: 2100, patrols: 40 },
      { month: 'Jun', trees: 1780, patrols: 36 },
      { month: 'Jul', trees: 2400, patrols: 48 },
      { month: 'Aug', trees: 2200, patrols: 42 },
    ],
  };

  return NextResponse.json(data);
}
