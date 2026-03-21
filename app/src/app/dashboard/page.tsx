"use client";

import { useState } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface Condition {
  index: number;
  type: string;
  fulfilled: boolean;
  fulfilledBy: string | null;
  proofHash: string | null;
}

interface Pact {
  address: string;
  issuer: string;
  issuerLabel: string;
  beneficiary: string;
  beneficiaryLabel: string;
  status: string;
  collateralAmount: number;
  conditionCount: number;
  conditionsFulfilled: number;
  createdAt: string;
  expiryAt: string;
  memo: string;
  pactMint: string | null;
  tokenFrozen: boolean | null;
  conditions: Condition[];
}

// ---------------------------------------------------------------------------
// Mock Data — matches demo script scenarios
// ---------------------------------------------------------------------------
const MOCK_PACTS: Pact[] = [
  {
    address: "8Xk9..mQz4",
    issuer: "47Fg..ZyfS",
    issuerLabel: "AMINA Bank",
    beneficiary: "9rTp..vK2j",
    beneficiaryLabel: "Zurich Corp",
    status: "Settled",
    collateralAmount: 10_000_000_000,
    conditionCount: 2,
    conditionsFulfilled: 2,
    createdAt: "2026-03-20T14:30:00Z",
    expiryAt: "2026-03-27T14:30:00Z",
    memo: "OTC USDC Settlement #001",
    pactMint: "6FWQ..sr5R",
    tokenFrozen: false,
    conditions: [
      {
        index: 0,
        type: "Manual",
        fulfilled: true,
        fulfilledBy: "AMINA Bank",
        proofHash: "delivery-receipt-SHA256-abc123",
      },
      {
        index: 1,
        type: "Agent",
        fulfilled: true,
        fulfilledBy: "Cortex AI",
        proofHash: "inspection-report-SHA256-xyz789",
      },
    ],
  },
  {
    address: "3vNp..kR7w",
    issuer: "47Fg..ZyfS",
    issuerLabel: "AMINA Bank",
    beneficiary: "9rTp..vK2j",
    beneficiaryLabel: "Zurich Corp",
    status: "Recalled",
    collateralAmount: 5_000_000_000,
    conditionCount: 1,
    conditionsFulfilled: 0,
    createdAt: "2026-03-20T15:00:00Z",
    expiryAt: "2026-03-27T15:00:00Z",
    memo: "Flagged counterparty test",
    pactMint: "4jKm..pQ8t",
    tokenFrozen: null, // burned
    conditions: [
      {
        index: 0,
        type: "Manual",
        fulfilled: false,
        fulfilledBy: null,
        proofHash: null,
      },
    ],
  },
  {
    address: "7mWq..nT5x",
    issuer: "47Fg..ZyfS",
    issuerLabel: "AMINA Bank",
    beneficiary: "2kLp..hG9r",
    beneficiaryLabel: "Hong Kong Trading Ltd",
    status: "Active",
    collateralAmount: 50_000_000_000,
    conditionCount: 3,
    conditionsFulfilled: 1,
    createdAt: "2026-03-20T16:00:00Z",
    expiryAt: "2026-04-19T16:00:00Z",
    memo: "Cross-border supply chain settlement",
    pactMint: "2rXn..wM4k",
    tokenFrozen: true,
    conditions: [
      {
        index: 0,
        type: "DocumentVerification",
        fulfilled: true,
        fulfilledBy: "Shipping Agent",
        proofHash: "bill-of-lading-SHA256-doc001",
      },
      {
        index: 1,
        type: "Oracle",
        fulfilled: false,
        fulfilledBy: null,
        proofHash: null,
      },
      {
        index: 2,
        type: "TimeBased",
        fulfilled: false,
        fulfilledBy: null,
        proofHash: null,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatUsdc(amount: number): string {
  return `$${(amount / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    Settled: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    Disputed: "bg-red-500/20 text-red-400 border-red-500/30",
    Recalled: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    Expired: "bg-gray-500/20 text-gray-400 border-gray-500/30",
  };
  return (
    <span
      className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? colors.Expired}`}
    >
      {status}
    </span>
  );
}

function TokenBadge({
  label,
  variant,
}: {
  label: string;
  variant: "cyan" | "gold" | "red" | "green";
}) {
  const colors = {
    cyan: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    gold: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    red: "bg-red-500/10 text-red-400 border-red-500/30",
    green: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-[10px] font-mono font-medium border ${colors[variant]}`}
    >
      {label}
    </span>
  );
}

function ConditionIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    Manual: "M",
    Agent: "AI",
    Oracle: "O",
    TimeBased: "T",
    DocumentVerification: "D",
  };
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-navy-600 text-[10px] font-bold text-accent-cyan">
      {icons[type] ?? "?"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------
function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-navy-800 border border-navy-600 rounded-xl p-5 glow-cyan">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
        {label}
      </p>
      <p className="text-2xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  );
}

function PactRow({
  pact,
  expanded,
  onToggle,
}: {
  pact: Pact;
  expanded: boolean;
  onToggle: () => void;
}) {
  const progress =
    pact.conditionCount > 0
      ? (pact.conditionsFulfilled / pact.conditionCount) * 100
      : 0;

  return (
    <>
      <tr
        onClick={onToggle}
        className="border-b border-navy-700 hover:bg-navy-700/50 cursor-pointer transition-colors"
      >
        <td className="px-4 py-3">
          <code className="text-xs text-accent-cyan">{pact.address}</code>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={pact.status} />
        </td>
        <td className="px-4 py-3 text-sm font-medium text-white">
          {formatUsdc(pact.collateralAmount)}
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-navy-600 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-cyan rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-gray-400">
              {pact.conditionsFulfilled}/{pact.conditionCount}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {pact.issuerLabel}
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {pact.beneficiaryLabel}
        </td>
        <td className="px-4 py-3 text-xs text-gray-500">
          {pact.memo}
        </td>
        <td className="px-4 py-3 text-gray-500">
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-navy-800/50">
          <td colSpan={8} className="px-4 py-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Conditions */}
              <div>
                <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                  Conditions
                </h4>
                <div className="space-y-2">
                  {pact.conditions.map((c) => (
                    <div
                      key={c.index}
                      className="flex items-center gap-3 bg-navy-700/50 rounded-lg px-3 py-2"
                    >
                      <ConditionIcon type={c.type} />
                      <div className="flex-1">
                        <span className="text-xs text-gray-300">
                          {c.type}
                        </span>
                        {c.fulfilledBy && (
                          <span className="text-xs text-gray-500 ml-2">
                            by {c.fulfilledBy}
                          </span>
                        )}
                      </div>
                      {c.fulfilled ? (
                        <span className="text-emerald-400 text-xs">
                          Fulfilled
                        </span>
                      ) : (
                        <span className="text-amber-400 text-xs">
                          Pending
                        </span>
                      )}
                      {c.proofHash && (
                        <code className="text-[10px] text-gray-500 ml-2">
                          {c.proofHash.slice(0, 16)}...
                        </code>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Token-2022 */}
              <div>
                <h4 className="text-xs uppercase tracking-wider text-gray-500 mb-3">
                  Token-2022 Pact Mint
                </h4>
                {pact.pactMint ? (
                  <div className="bg-navy-700/50 rounded-lg px-4 py-3 space-y-3">
                    <div>
                      <span className="text-xs text-gray-500">Mint: </span>
                      <code className="text-xs text-accent-gold">
                        {pact.pactMint}
                      </code>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <TokenBadge label="DefaultFrozen" variant="cyan" />
                      <TokenBadge label="PermanentDelegate" variant="gold" />
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">
                        Token Status:{" "}
                      </span>
                      {pact.tokenFrozen === null ? (
                        <TokenBadge label="BURNED" variant="red" />
                      ) : pact.tokenFrozen ? (
                        <TokenBadge label="FROZEN" variant="cyan" />
                      ) : (
                        <TokenBadge label="THAWED" variant="green" />
                      )}
                    </div>
                    <div className="text-[10px] text-gray-500 leading-relaxed">
                      {pact.tokenFrozen === null
                        ? "Token burned by permanent delegate — settlement claim destroyed."
                        : pact.tokenFrozen
                          ? "Token frozen — cannot transfer until settlement."
                          : "Token thawed — settlement claim is transferable."}
                    </div>
                  </div>
                ) : (
                  <div className="bg-navy-700/50 rounded-lg px-4 py-3 text-xs text-gray-500">
                    No Pact mint created
                  </div>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Dashboard() {
  const [expandedPact, setExpandedPact] = useState<string | null>(null);

  const totalPacts = MOCK_PACTS.length;
  const activePacts = MOCK_PACTS.filter((p) => p.status === "Active").length;
  const totalCollateral = MOCK_PACTS.reduce(
    (sum, p) => sum + (p.status === "Active" ? p.collateralAmount : 0),
    0
  );
  const totalConditions = MOCK_PACTS.reduce(
    (sum, p) => sum + p.conditionCount,
    0
  );
  const fulfilledConditions = MOCK_PACTS.reduce(
    (sum, p) => sum + p.conditionsFulfilled,
    0
  );
  const fulfillmentPct =
    totalConditions > 0
      ? Math.round((fulfilledConditions / totalConditions) * 100)
      : 0;

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Nav */}
      <nav className="border-b border-navy-700/50 backdrop-blur-md sticky top-0 z-50 bg-navy-900/80 -mx-6 px-6 -mt-8 mb-8">
        <div className="h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-cyan to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="font-bold text-white text-lg">Pact Protocol</span>
          </a>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-gray-400">Devnet</span>
            </div>
            <code className="text-xs text-gray-500 bg-navy-800 px-3 py-1.5 rounded-lg border border-navy-700">
              CoiQ..RHi8
            </code>
          </div>
        </div>
      </nav>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Pacts" value={String(totalPacts)} sub="All time" />
        <StatCard
          label="Active Pacts"
          value={String(activePacts)}
          sub="Currently open"
        />
        <StatCard
          label="Collateral Locked"
          value={formatUsdc(totalCollateral)}
          sub="Active escrows"
        />
        <StatCard
          label="Conditions Fulfilled"
          value={`${fulfillmentPct}%`}
          sub={`${fulfilledConditions} of ${totalConditions}`}
        />
      </div>

      {/* Token-2022 Feature Banner */}
      <div className="mb-8 bg-gradient-to-r from-navy-800 to-navy-700 border border-navy-600 rounded-xl p-5 glow-gold">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-white mb-1">
              Token-2022 Extensions
            </h3>
            <p className="text-xs text-gray-500">
              Every Pact token enforces compliance at the protocol level — not
              the application level.
            </p>
          </div>
          <div className="flex gap-3">
            <div className="text-center">
              <TokenBadge label="DefaultFrozen" variant="cyan" />
              <p className="text-[10px] text-gray-500 mt-1">
                Tokens frozen until settlement
              </p>
            </div>
            <div className="text-center">
              <TokenBadge label="PermanentDelegate" variant="gold" />
              <p className="text-[10px] text-gray-500 mt-1">
                Institutional clawback
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Pact Table */}
      <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-navy-700">
          <h2 className="text-sm font-semibold text-white">Pact Escrows</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-navy-700 text-xs text-gray-500 uppercase tracking-wider">
                <th className="text-left px-4 py-3 font-medium">Address</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Collateral</th>
                <th className="text-left px-4 py-3 font-medium">Conditions</th>
                <th className="text-left px-4 py-3 font-medium">Issuer</th>
                <th className="text-left px-4 py-3 font-medium">Beneficiary</th>
                <th className="text-left px-4 py-3 font-medium">Memo</th>
                <th className="text-left px-4 py-3 font-medium w-8" />
              </tr>
            </thead>
            <tbody>
              {MOCK_PACTS.map((pact) => (
                <PactRow
                  key={pact.address}
                  pact={pact}
                  expanded={expandedPact === pact.address}
                  onToggle={() =>
                    setExpandedPact(
                      expandedPact === pact.address ? null : pact.address
                    )
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <footer className="mt-8 text-center text-xs text-gray-500">
        <p>
          Pact Protocol — StableHacks 2026 | Track 3: Programmable Stablecoin
          Payments
        </p>
        <p className="mt-1">
          Built with Anchor 0.32.1 | Token-2022 | Solana Devnet
        </p>
      </footer>
    </div>
  );
}
