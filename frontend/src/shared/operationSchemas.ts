
import { walletAddress } from '@/lib/addresses';

export type OpCategory = "transaction" | "query" | "template" | "quick" | "automation";

export interface OpField {
  key: string; label: string; type: "text" | "number" | "select" | "boolean" | "textarea";
  default: any; options?: string[]; hint?: string; required?: boolean;
}

export interface Operation {
  id: string; name: string; category: OpCategory;
  service: "insurance" | "trust" | "pension" | "all";
  description: string; fields: OpField[];
  template?: Record<string, any>; // pre-fills all fields
  badge?: string;
}

export const KAI_ACCOUNT    = walletAddress(process.env.NEXT_PUBLIC_KAI_ACCOUNT) ?? "0xB13727161583e38185530755a1A96D00fcCae870";
export const OWNER_ACCOUNT  = walletAddress(process.env.NEXT_PUBLIC_OWNER_ACCOUNT) ?? "0xB13727161583e38185530755a1A96D00fcCae870";

export const OPERATIONS: Operation[] = [
  // ── Quick Start ──────────────────────────────────────────
  { id: "qs_create_insurance", name: "Create Insurance Policy", category: "quick", service: "insurance", description: "Quickly create a basic insurance policy.", badge: "Popular",
    fields: [
      { key: "title", label: "Policy Title", type: "text", default: "My Insurance Policy", required: true },
      { key: "coverageType", label: "Coverage Type", type: "select", default: "Group Health", options: ["Group Health","Motor","Life","Crop","Property","Travel"] },
      { key: "premium", label: "Premium (ETH)", type: "number", default: 0.001 },
    ]
  },
  { id: "qs_create_trust", name: "Create Family Trust", category: "quick", service: "trust", description: "Quickly set up a programmable family trust.", badge: "Popular",
    fields: [
      { key: "trustName", label: "Trust Name", type: "text", default: "KAI Family Trust", required: true },
      { key: "settlor", label: "Settlor Account", type: "text", default: OWNER_ACCOUNT },
      { key: "fundingAmount", label: "Initial Funding (ETH)", type: "number", default: 0.01 },
    ]
  },
  { id: "qs_create_pension", name: "Create Pension Plan", category: "quick", service: "pension", description: "Quickly start a personal or employer pension plan.",
    fields: [
      { key: "planTitle", label: "Plan Title", type: "text", default: "SME Pension Vault", required: true },
      { key: "contribution", label: "Contribution (ETH)", type: "number", default: 0.005 },
      { key: "vestingCliff", label: "Vesting Cliff (Months)", type: "number", default: 24 },
    ]
  },
  { id: "qs_execute_policy", name: "Execute Policy", category: "quick", service: "all", description: "Execute any existing policy by ID.",
    fields: [
      { key: "policyId", label: "Policy ID", type: "text", default: "pol_", required: true },
      { key: "memo", label: "Execution Memo", type: "text", default: "Manual execution via KAI Playground" },
    ]
  },

  // ── Insurance: Transactions ───────────────────────────────
  { id: "ins_create", name: "Create Policy", category: "transaction", service: "insurance", description: "Initialize an on-chain insurance policy with premium schedules and beneficiaries.",
    fields: [
      { key: "policyTitle", label: "Policy Title", type: "text", default: "CFA Group Health Cover", required: true },
      { key: "coverageType", label: "Coverage Type", type: "select", default: "Group Health", options: ["Group Health","Motor","Life","Crop & Climate Index","SME Asset Protection","Travel","Property"] },
      { key: "owner", label: "Owner Wallet Address", type: "text", default: OWNER_ACCOUNT, hint: "Ethereum & Hedera EVM wallet address" },
      { key: "beneficiary", label: "Beneficiary Group / Account", type: "text", default: "CFA Member Pool" },
      { key: "premium", label: "Premium (ETH)", type: "number", default: 0.001, required: true },
      { key: "maxClaim", label: "Max Claim Limit (ETH)", type: "number", default: 0.1 },
      { key: "gracePeriod", label: "Grace Period (Days)", type: "number", default: 14 },
      { key: "autoRenew", label: "Enable Auto Renewal", type: "boolean", default: true },
    ]
  },
  { id: "ins_update", name: "Update Policy", category: "transaction", service: "insurance", description: "Update configuration of an existing insurance policy.",
    fields: [
      { key: "policyId", label: "Policy ID", type: "text", default: "pol_", required: true },
      { key: "premium", label: "New Premium (ETH)", type: "number", default: 0.001 },
      { key: "maxClaim", label: "New Max Claim (ETH)", type: "number", default: 0.1 },
    ]
  },
  { id: "ins_add_coverage", name: "Add Coverage", category: "transaction", service: "insurance", description: "Extend an existing policy with additional coverage layers.",
    fields: [
      { key: "policyId", label: "Policy ID", type: "text", default: "pol_", required: true },
      { key: "coverageType", label: "Coverage Type", type: "select", default: "Maternity", options: ["Maternity","Dental","Optical","Inpatient","Outpatient","Critical Illness"] },
      { key: "coverageLimit", label: "Coverage Limit (ETH)", type: "number", default: 0.1 },
    ]
  },
  { id: "ins_add_beneficiary", name: "Add Beneficiary", category: "transaction", service: "insurance", description: "Attach a beneficiary account to an insurance policy.",
    fields: [
      { key: "policyId", label: "Policy ID", type: "text", default: "pol_", required: true },
      { key: "beneficiaryAccount", label: "Beneficiary Wallet Address", type: "text", default: "" },
      { key: "allocationPercent", label: "Allocation (%)", type: "number", default: 100 },
    ]
  },
  { id: "ins_configure_claims", name: "Configure Claim Rules", category: "transaction", service: "insurance", description: "Set automated claim approval logic and assessor requirements.",
    fields: [
      { key: "policyId", label: "Policy ID", type: "text", default: "pol_", required: true },
      { key: "assessorAccount", label: "Claims Assessor Account", type: "text", default: KAI_ACCOUNT },
      { key: "requireEventProof", label: "Require Event Proof", type: "boolean", default: true },
      { key: "autoApproveBelow", label: "Auto-Approve Claims Below (ETH)", type: "number", default: 0.01 },
      { key: "gracePeriod", label: "Grace Period (Days)", type: "number", default: 7 },
    ]
  },
  { id: "ins_pause", name: "Pause Policy", category: "transaction", service: "insurance", description: "Temporarily suspend premium collection and claim processing.",
    fields: [{ key: "policyId", label: "Policy ID", type: "text", default: "pol_", required: true }, { key: "reason", label: "Pause Reason", type: "text", default: "Pending review" }]
  },
  { id: "ins_resume", name: "Resume Policy", category: "transaction", service: "insurance", description: "Reactivate a paused insurance policy.",
    fields: [{ key: "policyId", label: "Policy ID", type: "text", default: "pol_", required: true }]
  },
  { id: "ins_terminate", name: "Terminate Policy", category: "transaction", service: "insurance", description: "Permanently close an insurance policy and settle outstanding claims.",
    fields: [
      { key: "policyId", label: "Policy ID", type: "text", default: "pol_", required: true },
      { key: "settlementAccount", label: "Settlement Account", type: "text", default: OWNER_ACCOUNT },
      { key: "reason", label: "Termination Reason", type: "text", default: "Policy matured" },
    ]
  },
  { id: "ins_set_premium_schedule", name: "Set Premium Schedule", category: "transaction", service: "insurance", description: "Define or update the premium collection schedule and amounts.",
    fields: [
      { key: "policyId", label: "Policy ID", type: "text", default: "pol_", required: true },
      { key: "frequency", label: "Billing Frequency", type: "select", default: "Monthly", options: ["Daily","Weekly","Monthly","Quarterly","Annually"] },
      { key: "amount", label: "Premium Amount (ETH)", type: "number", default: 0.001 },
      { key: "startDate", label: "First Billing Date", type: "text", default: "2026-08-01" },
    ]
  },
  { id: "ins_calculate_premium", name: "Calculate Premium", category: "transaction", service: "insurance", description: "Compute premium based on risk profile and coverage type.",
    fields: [
      { key: "coverageType", label: "Coverage Type", type: "select", default: "Group Health", options: ["Group Health","Motor","Life","Crop","Property"] },
      { key: "memberCount", label: "Number of Members", type: "number", default: 10 },
      { key: "ageRange", label: "Average Age Range", type: "select", default: "25-35", options: ["18-25","25-35","35-45","45-55","55+"] },
      { key: "riskLevel", label: "Risk Level", type: "select", default: "Medium", options: ["Low","Medium","High"] },
    ]
  },
  // Insurance Queries
  { id: "ins_get_policy", name: "Get Policy", category: "query", service: "insurance", description: "Retrieve policy details and current status.",
    fields: [{ key: "policyId", label: "Policy ID", type: "text", default: "pol_", required: true }]
  },
  { id: "ins_get_claims", name: "Get Claims", category: "query", service: "insurance", description: "List all claims submitted against a policy.",
    fields: [{ key: "policyId", label: "Policy ID", type: "text", default: "pol_" }, { key: "status", label: "Filter by Status", type: "select", default: "all", options: ["all","pending","approved","rejected","paid"] }]
  },
  { id: "ins_get_audit_log", name: "Get Policy Audit Log", category: "query", service: "insurance", description: "Retrieve the full policy activity history.",
    fields: [{ key: "policyId", label: "Policy ID", type: "text", default: "pol_" }]
  },

  // ── Trust: Transactions ───────────────────────────────────
  { id: "trs_create", name: "Create Trust", category: "transaction", service: "trust", description: "Initialize a programmable multi-signature trust with settlor, trustees, and asset backing.",
    fields: [
      { key: "trustName", label: "Trust Name", type: "text", default: "KAI Family Asset Trust", required: true },
      { key: "trustType", label: "Trust Type", type: "select", default: "Family Trust", options: ["Family Trust","Estate Trust","Investment Trust","Charitable Trust","Education Trust","SME Escrow"] },
      { key: "settlor", label: "Settlor Account ID", type: "text", default: OWNER_ACCOUNT, hint: "Account funding the trust" },
      { key: "trustee", label: "Primary Trustee Account", type: "text", default: KAI_ACCOUNT },
      { key: "beneficiary", label: "Beneficiary Wallet Address", type: "text", default: "" },
      { key: "fundingAmount", label: "Initial Asset Value (ETH)", type: "number", default: 0.01, required: true },
      { key: "autoReleaseOnMilestone", label: "Enable Milestone Auto-Release", type: "boolean", default: true },
      { key: "requireMultiSig", label: "Require Multi-Sig Approval", type: "boolean", default: false },
    ]
  },
  { id: "trs_add_trustee", name: "Add Co-Trustee", category: "transaction", service: "trust", description: "Attach an additional trustee for multi-sig governance.",
    fields: [
      { key: "trustId", label: "Trust Policy ID", type: "text", default: "pol_", required: true },
      { key: "trusteeAccount", label: "Co-Trustee Wallet Address", type: "text", default: "" },
      { key: "sigWeight", label: "Signature Weight", type: "number", default: 1 },
      { key: "threshold", label: "Approval Threshold", type: "select", default: "2-of-3", options: ["1-of-1","1-of-2","2-of-3","2-of-4","3-of-5"] },
    ]
  },
  { id: "trs_define_distribution", name: "Define Distribution Rules", category: "transaction", service: "trust", description: "Set programmable triggers for releasing trust capital to beneficiaries.",
    fields: [
      { key: "trustId", label: "Trust Policy ID", type: "text", default: "pol_", required: true },
      { key: "triggerCondition", label: "Trigger Condition", type: "select", default: "Age Threshold (21 Yrs)", options: ["Age Threshold (21 Yrs)","University Admission Proof","Marriage Milestone","Fixed Calendar Date","Death of Settlor","Event Proof"] },
      { key: "payoutType", label: "Payout Structure", type: "select", default: "Monthly Allowance", options: ["Monthly Allowance","Lump Sum (100%)","Tranche (33/33/34)","Custom Schedule"] },
      { key: "amount", label: "Release Amount (ETH)", type: "number", default: 0.01 },
    ]
  },
  { id: "trs_create_milestone", name: "Create Milestone", category: "transaction", service: "trust", description: "Define a milestone event that unlocks trust assets on verified proof.",
    fields: [
      { key: "trustId", label: "Trust Policy ID", type: "text", default: "pol_", required: true },
      { key: "milestoneName", label: "Milestone Name", type: "text", default: "University Enrollment" },
      { key: "milestoneType", label: "Milestone Type", type: "select", default: "Event Proof", options: ["Event Proof","Date Reached","Oracle Feed","Manual Approval"] },
      { key: "releaseAmount", label: "Release Amount on Achievement (ETH)", type: "number", default: 0.01 },
    ]
  },
  { id: "trs_lock_assets", name: "Lock Trust Assets", category: "transaction", service: "trust", description: "Immutably time-lock trust assets until conditions are met on-chain.",
    fields: [
      { key: "trustId", label: "Trust Policy ID", type: "text", default: "pol_", required: true },
      { key: "timelockMonths", label: "Timelock Duration (Months)", type: "number", default: 12 },
      { key: "antiTamper", label: "Enable Anti-Tamper Guard", type: "boolean", default: true },
    ]
  },
  { id: "trs_attach_assets", name: "Attach Assets", category: "transaction", service: "trust", description: "Lock additional ETH or ERC-20 tokens into the trust vault.",
    fields: [
      { key: "trustId", label: "Trust Policy ID", type: "text", default: "pol_", required: true },
      { key: "assetType", label: "Asset Type", type: "select", default: "ETH", options: ["ETH","ERC-20 Token","NFT"] },
      { key: "amount", label: "Amount", type: "number", default: 100 },
      { key: "tokenAddress", label: "Token Contract (if applicable)", type: "text", default: "" },
    ]
  },
  { id: "trs_suspend", name: "Suspend Trust", category: "transaction", service: "trust", description: "Temporarily freeze all trust operations pending review.",
    fields: [
      { key: "trustId", label: "Trust Policy ID", type: "text", default: "pol_", required: true },
      { key: "reason", label: "Suspension Reason", type: "text", default: "Legal review in progress" },
    ]
  },
  { id: "trs_deploy", name: "Deploy Trust On-Chain", category: "transaction", service: "trust", description: "Finalize trust configuration for permanent activation on Ethereum & Hedera.",
    fields: [
      { key: "trustId", label: "Trust Policy ID", type: "text", default: "pol_", required: true },
      { key: "confirmImmutability", label: "Confirm Immutability After Deployment", type: "boolean", default: true },
    ]
  },
  // Trust Queries
  { id: "trs_get_trust", name: "Get Trust Details", category: "query", service: "trust", description: "Retrieve full trust configuration, status and beneficiary list.",
    fields: [{ key: "trustId", label: "Trust Policy ID", type: "text", default: "pol_", required: true }]
  },
  { id: "trs_get_audit", name: "Get Trust Audit Log", category: "query", service: "trust", description: "Fetch the activity history for all trust events.",
    fields: [{ key: "trustId", label: "Trust Policy ID", type: "text", default: "pol_" }]
  },
  { id: "trs_get_assets", name: "Get Trust Assets", category: "query", service: "trust", description: "View all assets currently locked in the trust vault.",
    fields: [{ key: "trustId", label: "Trust Policy ID", type: "text", default: "pol_" }]
  },

  // ── Pension: Transactions ─────────────────────────────────
  { id: "pen_create", name: "Create Pension Plan", category: "transaction", service: "pension", description: "Set up a time-locked retirement savings vault with employer matching and vesting schedule.",
    fields: [
      { key: "planTitle", label: "Pension Scheme Title", type: "text", default: "SME Employee Pension Vault", required: true },
      { key: "planType", label: "Plan Type", type: "select", default: "Corporate Pension", options: ["Personal Pension","Corporate Pension","SME Pension","Informal Worker Pension"] },
      { key: "memberAccount", label: "Member Account ID", type: "text", default: OWNER_ACCOUNT },
      { key: "employerAccount", label: "Employer Account ID", type: "text", default: KAI_ACCOUNT },
      { key: "monthlyContribution", label: "Deposit (ETH)", type: "number", default: 0.005, required: true },
      { key: "employerMatch", label: "Employer Match %", type: "number", default: 50 },
      { key: "vestingCliff", label: "Vesting Cliff (Months)", type: "number", default: 24 },
      { key: "autoInvest", label: "Enable Auto Investment", type: "boolean", default: true },
    ]
  },
  { id: "pen_add_employer", name: "Add Employer", category: "transaction", service: "pension", description: "Link an employer account to a pension plan for contribution matching.",
    fields: [
      { key: "planId", label: "Pension Plan ID", type: "text", default: "pol_", required: true },
      { key: "employerAccount", label: "Employer Account ID", type: "text", default: KAI_ACCOUNT },
      { key: "matchPercent", label: "Employer Match %", type: "number", default: 50 },
      { key: "matchCap", label: "Match Cap (ETH)", type: "number", default: 0.01 },
    ]
  },
  { id: "pen_configure_contribution", name: "Configure Contribution Rules", category: "transaction", service: "pension", description: "Set contribution amount, frequency, and escalation rules.",
    fields: [
      { key: "planId", label: "Pension Plan ID", type: "text", default: "pol_", required: true },
      { key: "frequency", label: "Contribution Frequency", type: "select", default: "Monthly", options: ["Weekly","Bi-Weekly","Monthly","Quarterly"] },
      { key: "amount", label: "Contribution Amount (ETH)", type: "number", default: 0.005 },
      { key: "escalationRate", label: "Annual Escalation Rate (%)", type: "number", default: 5 },
    ]
  },
  { id: "pen_attach_strategy", name: "Attach Investment Strategy", category: "transaction", service: "pension", description: "Link an on-chain investment strategy to the pension vault.",
    fields: [
      { key: "planId", label: "Pension Plan ID", type: "text", default: "pol_", required: true },
      { key: "strategy", label: "Investment Strategy", type: "select", default: "Balanced", options: ["Conservative","Balanced","Growth","Aggressive","ETH-Only"] },
      { key: "rebalanceFrequency", label: "Rebalance Frequency", type: "select", default: "Quarterly", options: ["Monthly","Quarterly","Annually","Manual"] },
    ]
  },
  { id: "pen_withdraw", name: "Withdraw", category: "transaction", service: "pension", description: "Process a withdrawal from the pension vault (subject to vesting rules).",
    fields: [
      { key: "planId", label: "Pension Plan ID", type: "text", default: "pol_", required: true },
      { key: "amount", label: "Withdrawal Amount (ETH)", type: "number", default: 0.01 },
      { key: "reason", label: "Withdrawal Reason", type: "select", default: "Retirement", options: ["Retirement","Medical Emergency","Partial Withdrawal","Account Closure"] },
    ]
  },
  { id: "pen_calculate_projection", name: "Calculate Retirement Projection", category: "transaction", service: "pension", description: "Project retirement value based on contributions, matching, and growth rate.",
    fields: [
      { key: "planId", label: "Pension Plan ID", type: "text", default: "pol_" },
      { key: "currentBalance", label: "Current Balance (ETH)", type: "number", default: 0.1 },
      { key: "monthlyContrib", label: "Contribution (ETH)", type: "number", default: 0.005 },
      { key: "years", label: "Years to Retirement", type: "number", default: 30 },
      { key: "annualReturn", label: "Expected Annual Return (%)", type: "number", default: 8 },
    ]
  },
  { id: "pen_deploy", name: "Deploy Pension On-Chain", category: "transaction", service: "pension", description: "Finalize pension plan on Ethereum & Hedera.",
    fields: [
      { key: "planId", label: "Pension Plan ID", type: "text", default: "pol_", required: true },
    ]
  },
  // Pension Queries
  { id: "pen_get_plan", name: "Get Pension Plan", category: "query", service: "pension", description: "Retrieve pension plan details and current status.",
    fields: [{ key: "planId", label: "Pension Plan ID", type: "text", default: "pol_", required: true }]
  },
  { id: "pen_get_contributions", name: "Contribution History", category: "query", service: "pension", description: "View all recorded contributions.",
    fields: [{ key: "planId", label: "Pension Plan ID", type: "text", default: "pol_" }]
  },
  { id: "pen_get_projection", name: "Retirement Projection", category: "query", service: "pension", description: "View the latest retirement value projection for the plan.",
    fields: [{ key: "planId", label: "Pension Plan ID", type: "text", default: "pol_" }]
  },

  // ── Templates (auto-fill) ─────────────────────────────────
  { id: "tpl_motor", name: "Motor Insurance", category: "template", service: "insurance", description: "Pre-configured motor insurance policy with comprehensive cover and 14-day grace.", badge: "Motor",
    fields: [], template: { policyTitle: "Comprehensive Motor Cover", coverageType: "Motor", premium: 200, maxClaim: 4000, gracePeriod: 14, autoRenew: true }
  },
  { id: "tpl_health", name: "Medical Insurance", category: "template", service: "insurance", description: "Group medical cover for SMEs and SACCOs with inpatient/outpatient benefits.", badge: "Medical",
    fields: [], template: { policyTitle: "SME Group Medical Cover", coverageType: "Group Health", premium: 350, maxClaim: 10000, gracePeriod: 7, autoRenew: true }
  },
  { id: "tpl_life", name: "Life Insurance", category: "template", service: "insurance", description: "Whole-life policy with beneficiary distribution and funeral benefits.", badge: "Life",
    fields: [], template: { policyTitle: "Life Cover Plus", coverageType: "Life", premium: 150, maxClaim: 50000, gracePeriod: 30, autoRenew: false }
  },
  { id: "tpl_crop", name: "Crop & Climate Insurance", category: "template", service: "insurance", description: "Index-based crop insurance for smallholder farmers triggered by verified weather data.", badge: "Crop",
    fields: [], template: { policyTitle: "Climate Index Crop Cover", coverageType: "Crop & Climate Index", premium: 80, maxClaim: 2000, gracePeriod: 0, autoRenew: true }
  },
  { id: "tpl_family_trust", name: "Family Trust", category: "template", service: "trust", description: "Standard family trust with age-based milestone releases and multi-sig governance.", badge: "Family",
    fields: [], template: { trustName: "Namuye Family Trust", trustType: "Family Trust", fundingAmount: 1000, autoReleaseOnMilestone: true, requireMultiSig: true }
  },
  { id: "tpl_education_trust", name: "Education Trust", category: "template", service: "trust", description: "Education-linked trust releasing funds on university admission proof.", badge: "Education",
    fields: [], template: { trustName: "KAI Education Fund", trustType: "Education Trust", fundingAmount: 500, autoReleaseOnMilestone: true, requireMultiSig: false }
  },
  { id: "tpl_estate_trust", name: "Estate Trust", category: "template", service: "trust", description: "Estate management trust with executor multi-sig and scheduled distributions.", badge: "Estate",
    fields: [], template: { trustName: "Estate Management Trust", trustType: "Estate Trust", fundingAmount: 5000, autoReleaseOnMilestone: false, requireMultiSig: true }
  },
  { id: "tpl_charitable_trust", name: "Charitable Trust", category: "template", service: "trust", description: "Charitable trust disbursing funds to verified beneficiary accounts monthly.", badge: "Charity",
    fields: [], template: { trustName: "KAI Charitable Foundation", trustType: "Charitable Trust", fundingAmount: 2000, autoReleaseOnMilestone: true, requireMultiSig: false }
  },
  { id: "tpl_personal_pension", name: "Personal Pension", category: "template", service: "pension", description: "Individual retirement plan with 30-year horizon and auto-invest.", badge: "Personal",
    fields: [], template: { planTitle: "Personal Retirement Vault", planType: "Personal Pension", monthlyContribution: 200, employerMatch: 0, vestingCliff: 12, autoInvest: true }
  },
  { id: "tpl_sme_pension", name: "SME Pension", category: "template", service: "pension", description: "Corporate pension with 50% employer matching and 2-year vesting cliff.", badge: "SME",
    fields: [], template: { planTitle: "SME Employee Pension", planType: "SME Pension", monthlyContribution: 300, employerMatch: 50, vestingCliff: 24, autoInvest: true }
  },
  { id: "tpl_informal_pension", name: "Informal Worker Pension", category: "template", service: "pension", description: "Micro-savings pension for informal workers with weekly low-entry contributions.", badge: "Informal",
    fields: [], template: { planTitle: "Jua Kali Pension Plan", planType: "Informal Worker Pension", monthlyContribution: 30, employerMatch: 0, vestingCliff: 6, autoInvest: false }
  },
];

export const OPERATION_SCHEMAS: Record<string, OpField[]> = OPERATIONS.reduce((acc, op) => {
  acc[op.id] = op.fields;
  return acc;
}, {} as Record<string, OpField[]>);
