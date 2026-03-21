"use client";

import Link from "next/link";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------
const FEATURES = [
  {
    icon: "lock",
    title: "PDA Escrow Vault",
    desc: "Collateral locked in a program-derived escrow. No human custody. No counterparty risk.",
  },
  {
    icon: "conditions",
    title: "5 Condition Types",
    desc: "Manual, AI Agent, Oracle, Time-Based, Document Verification. Up to 8 per Pact.",
  },
  {
    icon: "freeze",
    title: "DefaultFrozen",
    desc: "Pact tokens frozen at creation. Cannot transfer until settlement. Protocol-level enforcement.",
  },
  {
    icon: "delegate",
    title: "PermanentDelegate",
    desc: "Issuer can burn tokens from any account. Sanctions enforcement without counterparty cooperation.",
  },
  {
    icon: "agent",
    title: "AI Agent Integration",
    desc: "MCP server with 5 tools. Cortex agents monitor conditions, auto-fulfill, predict bottlenecks.",
  },
  {
    icon: "audit",
    title: "On-Chain Audit Trail",
    desc: "Every action emits events. Reasoning hashes anchor AI decisions immutably on-chain.",
  },
];

const FLOW_STEPS = [
  { step: "01", label: "Lock", desc: "Issuer locks USDC in escrow vault" },
  { step: "02", label: "Mint", desc: "Token-2022 Pact token minted (frozen)" },
  { step: "03", label: "Conditions", desc: "Programmable conditions attached" },
  { step: "04", label: "Fulfill", desc: "Conditions verified on-chain or by AI" },
  { step: "05", label: "Settle", desc: "Collateral released, token thawed" },
];

const USE_CASES = [
  {
    title: "OTC Stablecoin Settlement",
    desc: "Atomic delivery-vs-payment for institutional trades. No manual coordination.",
    amount: "$500K+",
  },
  {
    title: "Conditional Custody Release",
    desc: "Programmable release based on milestones, vesting, or regulatory approvals.",
    amount: "Any size",
  },
  {
    title: "Cross-Border Payments",
    desc: "Lock USDC, release when shipping documents verified. No correspondent bank.",
    amount: "Minutes",
  },
  {
    title: "21X Securities Settlement",
    desc: "Settlement layer for DLT-traded securities on the EU trading venue.",
    amount: "Regulated",
  },
];

// ---------------------------------------------------------------------------
// Icon components
// ---------------------------------------------------------------------------
function FeatureIcon({ icon }: { icon: string }) {
  const paths: Record<string, React.ReactNode> = {
    lock: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
      />
    ),
    conditions: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
    freeze: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z"
      />
    ),
    delegate: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M9 12.75l3 3m0 0l3-3m-3 3v-7.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    ),
    agent: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M8.25 3v1.5M4.5 8.25H3m18 0h-1.5M4.5 12H3m18 0h-1.5m-15 3.75H3m18 0h-1.5M8.25 19.5V21M12 3v1.5m0 15V21m3.75-18v1.5m0 15V21m-9-1.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z"
      />
    ),
    audit: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
      />
    ),
  };

  return (
    <svg
      className="w-6 h-6 text-accent-cyan"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      {paths[icon]}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="border-b border-navy-700/50 backdrop-blur-md sticky top-0 z-50 bg-navy-900/80">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent-cyan to-blue-600 flex items-center justify-center">
              <span className="text-white font-bold text-sm">P</span>
            </div>
            <span className="font-bold text-white text-lg">Pact Protocol</span>
          </div>
          <div className="flex items-center gap-6">
            <a
              href="https://github.com/solder-build/pact-protocol"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              GitHub
            </a>
            <a
              href="https://explorer.solana.com/address/CoiQFqwmZU6KYq6BjMMz3yw9sgb5L8ngusPgtRXGRHi8?cluster=devnet"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Explorer
            </a>
            <Link
              href="/dashboard"
              className="text-sm font-medium bg-accent-cyan/10 text-accent-cyan border border-accent-cyan/30 px-4 py-2 rounded-lg hover:bg-accent-cyan/20 transition-colors"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-accent-cyan/5 via-transparent to-transparent" />
        <div className="max-w-6xl mx-auto px-6 pt-24 pb-20 relative">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 bg-navy-800 border border-navy-600 rounded-full px-4 py-1.5 mb-6">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-gray-400">
                Live on Solana Devnet
              </span>
              <span className="text-xs text-gray-600">|</span>
              <span className="text-xs text-gray-500">StableHacks 2026</span>
            </div>

            <h1 className="text-5xl font-bold text-white leading-tight mb-6">
              Programmable Letters
              <br />
              of Credit on{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-cyan to-blue-400">
                Solana
              </span>
            </h1>

            <p className="text-lg text-gray-400 leading-relaxed mb-8 max-w-2xl">
              Lock stablecoins. Define conditions. Auto-settle or escalate.
              Token-2022 enforcement ensures compliance at the protocol level —
              not the application level.
            </p>

            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="bg-accent-cyan text-navy-900 font-semibold px-6 py-3 rounded-lg hover:bg-accent-cyan/90 transition-colors"
              >
                View Dashboard
              </Link>
              <a
                href="https://github.com/solder-build/pact-protocol"
                target="_blank"
                rel="noopener noreferrer"
                className="border border-navy-600 text-gray-300 font-medium px-6 py-3 rounded-lg hover:border-gray-500 hover:text-white transition-colors"
              >
                View Source
              </a>
            </div>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-4 gap-4 mt-16">
            {[
              ["11", "On-Chain Instructions"],
              ["21", "Passing Tests"],
              ["5", "Condition Types"],
              ["2", "Token-2022 Extensions"],
            ].map(([val, label]) => (
              <div
                key={label}
                className="text-center bg-navy-800/50 border border-navy-700 rounded-xl py-4"
              >
                <p className="text-2xl font-bold text-accent-cyan">{val}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works — flow */}
      <section className="py-20 border-t border-navy-800">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-white mb-2">How It Works</h2>
          <p className="text-sm text-gray-500 mb-12">
            From issuance to settlement in five steps
          </p>

          <div className="flex items-start justify-between gap-2">
            {FLOW_STEPS.map((s, i) => (
              <div key={s.step} className="flex-1 relative">
                <div className="flex flex-col items-center text-center">
                  <div className="w-12 h-12 rounded-full bg-navy-700 border border-navy-600 flex items-center justify-center mb-3">
                    <span className="text-accent-cyan font-bold text-sm">
                      {s.step}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-white mb-1">
                    {s.label}
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {s.desc}
                  </p>
                </div>
                {i < FLOW_STEPS.length - 1 && (
                  <div className="absolute top-6 left-[56%] w-[88%] h-px bg-gradient-to-r from-accent-cyan/30 to-transparent" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 border-t border-navy-800">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-white mb-2">
            Built for Institutions
          </h2>
          <p className="text-sm text-gray-500 mb-12">
            Token-2022 extensions enforce compliance where it matters — at the
            protocol level
          </p>

          <div className="grid grid-cols-3 gap-5">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-navy-800 border border-navy-700 rounded-xl p-5 hover:border-navy-600 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-accent-cyan/10 flex items-center justify-center mb-4">
                  <FeatureIcon icon={f.icon} />
                </div>
                <h3 className="text-sm font-semibold text-white mb-2">
                  {f.title}
                </h3>
                <p className="text-xs text-gray-500 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section className="py-20 border-t border-navy-800">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-2xl font-bold text-white mb-2">Use Cases</h2>
          <p className="text-sm text-gray-500 mb-12">
            Programmable settlement for institutional stablecoin operations
          </p>

          <div className="grid grid-cols-2 gap-5">
            {USE_CASES.map((uc) => (
              <div
                key={uc.title}
                className="bg-navy-800 border border-navy-700 rounded-xl p-6 flex items-start gap-4"
              >
                <div className="shrink-0 w-12 h-12 rounded-lg bg-accent-gold/10 border border-accent-gold/20 flex items-center justify-center">
                  <span className="text-accent-gold text-xs font-bold">
                    {uc.amount}
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-1">
                    {uc.title}
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    {uc.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Token-2022 highlight */}
      <section className="py-20 border-t border-navy-800">
        <div className="max-w-6xl mx-auto px-6">
          <div className="bg-gradient-to-br from-navy-800 to-navy-700 border border-navy-600 rounded-2xl p-10 glow-gold">
            <div className="grid grid-cols-2 gap-10">
              <div>
                <h2 className="text-2xl font-bold text-white mb-4">
                  Token-2022 Extensions
                </h2>
                <p className="text-sm text-gray-400 leading-relaxed mb-6">
                  Every Pact token is a Token-2022 mint with two extensions that
                  make compliance enforcement structural — not optional.
                </p>
                <div className="space-y-4">
                  <div className="bg-navy-900/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium border bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                        DefaultFrozen
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Token accounts frozen at creation. The Pact token cannot
                      move until the program thaws it after settlement. Not a
                      check — the token physically cannot transfer.
                    </p>
                  </div>
                  <div className="bg-navy-900/50 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium border bg-amber-500/10 text-amber-400 border-amber-500/30">
                        PermanentDelegate
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">
                      The issuer can burn tokens from any account at any time.
                      Sanctions enforcement without counterparty cooperation. One
                      transaction, no lawyers.
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-accent-gold to-amber-600 mb-3">
                    $3T
                  </div>
                  <p className="text-sm text-gray-400">
                    Annual letter of credit market
                  </p>
                  <p className="text-xs text-gray-600 mt-1">Still paper-based</p>
                  <div className="mt-6 text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-b from-red-400 to-red-600 mb-3">
                    $2.5T
                  </div>
                  <p className="text-sm text-gray-400">Trade finance gap</p>
                  <p className="text-xs text-gray-600 mt-1">
                    ADB estimate — too slow, too expensive
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 border-t border-navy-800">
        <div className="max-w-6xl mx-auto px-6 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Not a platform. A primitive.
          </h2>
          <p className="text-sm text-gray-500 mb-8 max-w-xl mx-auto">
            Any institution can issue a Pact. Any counterparty can receive one.
            Settlement, escrow, and compliance enforced at the token level.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="bg-accent-cyan text-navy-900 font-semibold px-8 py-3 rounded-lg hover:bg-accent-cyan/90 transition-colors"
            >
              Explore Dashboard
            </Link>
            <a
              href="https://github.com/solder-build/pact-protocol"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-navy-600 text-gray-300 font-medium px-8 py-3 rounded-lg hover:border-gray-500 hover:text-white transition-colors"
            >
              GitHub
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-navy-800 py-8">
        <div className="max-w-6xl mx-auto px-6 flex items-center justify-between">
          <p className="text-xs text-gray-700">
            Pact Protocol — StableHacks 2026 | Track 3: Programmable Stablecoin
            Payments
          </p>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-700">
              Built with Anchor 0.32.1 | Token-2022 | Solana
            </span>
            <a
              href="https://solder.build"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
            >
              Solder
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
