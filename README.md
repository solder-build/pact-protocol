# Pact Protocol

**Programmable Letters of Credit on Solana**

Tokenized settlement obligations with Token-2022 enforcement. Lock stablecoins, define conditions, auto-execute or escalate.

**Program ID:** `CoiQFqwmZU6KYq6BjMMz3yw9sgb5L8ngusPgtRXGRHi8` (Solana Devnet)

Built for [StableHacks 2026](https://dorahacks.io/hackathon/stablehacks) | Track 3: Programmable Stablecoin Payments

---

## The Problem

Letters of credit are a $3 trillion per year market. They're still paper-based. The buyer's bank sends a SWIFT message. The seller's bank sends documents by courier. Humans review, approve, and release funds. Settlement takes 5-10 business days and costs 1-3% of the transaction value.

The Asian Development Bank estimates a $2.5 trillion trade finance gap -- businesses that can't get financing because the process is too slow, too expensive, or too opaque.

Previous attempts to digitize this (we.trade, Marco Polo) both went bankrupt. They tried to build consortium platforms. The problem wasn't digitization -- it was architecture.

## The Solution

A Pact is a tokenized settlement obligation on Solana. Here's how it works:

1. **Issuer locks collateral** -- USDC or USX goes into a PDA escrow vault
2. **Conditions are attached** -- delivery confirmation, quality inspection, document verification, oracle price feeds, time triggers
3. **Conditions get fulfilled** -- by humans, AI agents, oracles, or time
4. **Settlement executes automatically** -- collateral releases to beneficiary when all conditions are met
5. **Or it escalates** -- disputes, force-recall, expiry all handled on-chain

Each Pact is also represented as a **Token-2022 token** with two extensions that enforce compliance at the protocol level:

- **DefaultFrozen** -- The Pact token cannot be transferred until settlement. Not an application check -- the token literally can't move.
- **PermanentDelegate** -- The issuer can burn the token from any account at any time. Sanctions enforcement without counterparty cooperation.

## Architecture

```
                           PACT PROTOCOL

  Issuer (AMINA Bank)              Beneficiary (Zurich Corp)
         |                                    |
         | initialize_pact                    |
         | (lock USDC in vault)               |
         v                                    |
  +------------------+                        |
  |   Escrow Vault   |   PDA: [vault, pact]   |
  |   (holds USDC)   |                        |
  +------------------+                        |
         |                                    |
         | create_pact_mint                   |
         v                                    v
  +------------------+              +-------------------+
  | Token-2022 Mint  |              | Pact Token (1)    |
  | DefaultFrozen    |  -- mint --> | FROZEN            |
  | PermanentDelegate|              | (can't transfer)  |
  +------------------+              +-------------------+
         |
         | add_condition (x N)
         v
  +------------------+     +------------------+
  | Condition 0      |     | Condition 1      |
  | Manual: Delivery |     | Agent: Inspection|
  | fulfilled: false |     | fulfilled: false |
  +------------------+     +------------------+
         |                          |
         | fulfill (issuer)         | fulfill (AI agent)
         v                          v

  All conditions met? ----YES----> settle_pact
                                      |
                              Release collateral
                              to beneficiary
                                      |
                                thaw_pact_token
                                      |
                              Token is THAWED
                              (transferable)

  Dispute? ----YES----> dispute_pact --> force_recall
                                              |
                                      Return collateral
                                      to issuer
                                              |
                                      burn_pact_token
                                              |
                                      Token BURNED
                                      (destroyed)
```

## Token-2022 Extensions

This is what makes Pact different from every other escrow or trade finance project.

### DefaultFrozen

Every Pact token account is frozen at creation. The token represents a settlement obligation that hasn't been fulfilled yet -- it shouldn't be transferable. Only after settlement does the program thaw it, turning it into a liquid, on-chain proof of completed settlement.

This is protocol-level enforcement. No application logic to bypass. No smart contract to exploit. The token physically cannot move until the Pact PDA (the freeze authority) thaws it.

### PermanentDelegate

The issuer is set as the permanent delegate when the mint is created. This means the issuing institution can burn the Pact token from the beneficiary's account -- without the beneficiary's permission.

Why? Sanctions enforcement. If a counterparty is flagged after issuance, the institution needs to recall the instrument immediately. In traditional finance, this requires lawyers, courts, and weeks. On Pact, it's one transaction.

No other blockchain implements institutional clawback at the token level.

## Instructions

| # | Instruction | Signer | Description |
|---|---|---|---|
| 1 | `initialize_pact` | Issuer | Create escrow, lock collateral, record terms hash |
| 2 | `set_agent` | Issuer | Authorize an AI agent to auto-fulfill conditions |
| 3 | `add_condition` | Issuer | Add a programmable condition (5 types, max 8) |
| 4 | `fulfill_condition` | Varies | Fulfill a condition with proof hash |
| 5 | `settle_pact` | Beneficiary | Release collateral when all conditions met |
| 6 | `dispute_pact` | Either party | File a dispute |
| 7 | `force_recall` | Issuer | Return collateral (institutional override) |
| 8 | `expire_pact` | Anyone | Return collateral after expiry (cranker) |
| 9 | `create_pact_mint` | Issuer | Create Token-2022 mint with extensions, mint 1 to beneficiary |
| 10 | `thaw_pact_token` | Beneficiary | Unfreeze Pact token after settlement |
| 11 | `burn_pact_token` | Issuer | Burn Pact token via permanent delegate |

## Condition Types

| Type | Authorization | Use Case |
|---|---|---|
| **Manual** | Issuer or Beneficiary | Human sign-off, delivery confirmation |
| **Agent** | Authorized AI agent | Cortex auto-fulfills based on external data |
| **Oracle** | Oracle pubkey | External data feeds, price conditions |
| **TimeBased** | Anyone (after timestamp) | Waiting periods, vesting schedules |
| **DocumentVerification** | Anyone (with valid proof hash) | Bill of lading, inspection reports |

## Getting Started

```bash
# Build
anchor build

# Test (21 tests)
anchor test

# Deploy to devnet
anchor deploy --provider.cluster devnet
```

### Prerequisites

- Anchor CLI 0.32.1+
- Solana CLI 3.x
- Node.js 18+
- Rust (via rustup)

## Use Cases

### Institutional OTC Settlement

AMINA's institutional clients execute large stablecoin trades ($500K+). Today, settlement relies on trust and manual coordination. Pacts enforce delivery-vs-payment atomically. Buyer locks USDC, seller delivers tokens, conditions verify both sides, escrow releases.

### Conditional Custody Release

AMINA custodies digital assets for institutions. Some have conditional release terms -- vesting schedules, milestone-based releases, regulatory approvals. Currently tracked in spreadsheets. Pacts encode these conditions on-chain.

### 21X Securities Settlement

AMINA is the first regulated bank on 21X (EU DLT trading venue). Pacts provide the programmable settlement layer for DLT-traded securities.

### Cross-Border Corporate Payments

Lock USDC, release when shipping documents are verified by an oracle. No correspondent bank. No 5-day wait. Sub-minute settlement.

## What's Real vs. What's Simulated

I want to be upfront about what works today and what's architecture for the future.

**Real (on-chain, tested, deployed):**
- Escrow vault with PDA authority
- 5 condition types with correct authorization checks
- Token-2022 mint creation with DefaultFrozen + PermanentDelegate
- Thaw after settlement, burn via permanent delegate
- All 21 tests passing on localnet
- Program deployed to devnet

**Simulated / Not Yet Integrated:**
- Oracle conditions don't connect to Pyth or Switchboard yet (the condition type works, but there's no live oracle integration)
- Document verification accepts any non-zero hash (no actual document verification service)
- MCP tools for AI agent integration are in progress (the Agent condition type works on-chain, MCP server is being built)
- Transfer Hook extension (KYC enforcement on transfers) is designed but not integrated with the Pact mint in this version

## Test Coverage

21 tests across 7 test groups:

- **Happy Path** -- Create, add conditions, fulfill, settle (7 tests)
- **Dispute Path** -- Create, dispute, force recall (3 tests)
- **Error Cases** -- Unauthorized, double fulfillment, premature expire (5 tests)
- **Document Verification** -- Third-party fulfillment, zero-hash rejection (2 tests)
- **Max Conditions** -- 8 allowed, 9th rejected (1 test)
- **Token-2022 Happy Path** -- Create mint, frozen token, settle, thaw (2 tests)
- **Token-2022 Burn Path** -- Create mint, dispute, recall, permanent delegate burn (1 test)

## Built With

- [Anchor](https://www.anchor-lang.com/) 0.32.1
- [Solana](https://solana.com/) (spl-token-2022 v8.0.1)
- TypeScript / Mocha
- [MCP SDK](https://modelcontextprotocol.io/) (Model Context Protocol)

## Team

**Rick** -- Solo founder at [Solder](https://solder.build). Building AI agent infrastructure on Solana. Production Cortex MCP system (6,200 lines Rust), deployed Token Hooks program, Agent Court escrow. 5 hackathon projects shipped to production.

## License

MIT
