import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  getPactAccounts,
  getPact,
  getConditions,
  getSignatures,
} from "./solana.js";

export function registerTools(server: McpServer) {
  // Tool 1: pact_monitor
  server.tool(
    "pact_monitor",
    "Monitor active Pacts on Solana. Returns Pact escrows with status, collateral, conditions progress, and expiry countdown.",
    {
      filter: z
        .enum(["all", "active", "expiring_soon", "disputed", "settled"])
        .describe("Filter Pacts by status"),
      issuer: z
        .string()
        .optional()
        .describe("Optional: filter by issuer pubkey"),
    },
    async ({ filter, issuer }) => {
      const statusMap: Record<string, number | undefined> = {
        all: undefined,
        active: 0,
        settled: 1,
        disputed: 2,
        expiring_soon: 0,
      };

      const pacts = await getPactAccounts({
        issuer,
        status: statusMap[filter],
      });

      const now = BigInt(Math.floor(Date.now() / 1000));

      let results = pacts;
      if (filter === "expiring_soon") {
        const twentyFourHours = BigInt(24 * 3600);
        results = pacts.filter(
          (p) => p.expiryAt - now <= twentyFourHours && p.expiryAt > now
        );
      }

      const formatted = results.map((p) => ({
        address: p.address,
        issuer: p.issuer,
        beneficiary: p.beneficiary,
        status: p.statusLabel,
        collateral: `${Number(p.collateralAmount) / 1_000_000} USDC`,
        conditions: `${p.conditionsFulfilled}/${p.conditionCount}`,
        expiresIn: `${Number(p.expiryAt - now)} seconds`,
        pactMint: p.pactMint,
        memo: p.memo,
      }));

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              { count: formatted.length, pacts: formatted },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool 2: condition_check
  server.tool(
    "condition_check",
    "Check conditions on a specific Pact. Returns condition type, fulfillment status, and evidence.",
    {
      pact_address: z.string().describe("Pact escrow pubkey (base58)"),
    },
    async ({ pact_address }) => {
      const pact = await getPact(pact_address);
      if (!pact) {
        return {
          content: [
            { type: "text" as const, text: `Pact not found: ${pact_address}` },
          ],
        };
      }

      const conditions = await getConditions(
        pact_address,
        pact.conditionCount
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                pact: pact_address,
                status: pact.statusLabel,
                conditionCount: pact.conditionCount,
                conditionsFulfilled: pact.conditionsFulfilled,
                allMet:
                  pact.conditionsFulfilled === pact.conditionCount &&
                  pact.conditionCount > 0,
                conditions: conditions.map((c) => ({
                  index: c.index,
                  type: c.conditionTypeLabel,
                  fulfilled: c.fulfilled,
                  fulfilledBy: c.fulfilled ? c.fulfilledBy : null,
                  fulfilledAt: c.fulfilled
                    ? new Date(
                        Number(c.fulfilledAt) * 1000
                      ).toISOString()
                    : null,
                  proofHash: c.fulfilled ? c.proofHash : null,
                })),
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool 3: pact_issue
  server.tool(
    "pact_issue",
    "Generate parameters for a Pact issuance transaction. Returns the accounts and args needed to call initialize_pact.",
    {
      issuer: z.string().describe("Issuer pubkey"),
      beneficiary: z.string().describe("Beneficiary pubkey"),
      collateral_mint: z.string().describe("Collateral token mint"),
      collateral_amount: z
        .number()
        .describe("Amount in base units (e.g. 1000000 = 1 USDC)"),
      expiry_hours: z
        .number()
        .default(168)
        .describe("Expiry in hours (default: 168 = 7 days)"),
      terms: z.string().describe("Terms description"),
    },
    async ({
      issuer,
      beneficiary,
      collateral_mint,
      collateral_amount,
      expiry_hours,
      terms,
    }) => {
      const { PublicKey } = await import("@solana/web3.js");
      const { PROGRAM_ID } = await import("./types.js");

      // Generate terms hash
      const termsBytes = Buffer.from(terms, "utf-8");
      const termsHash = new Uint8Array(32);
      for (let i = 0; i < Math.min(termsBytes.length, 32); i++) {
        termsHash[i] = termsBytes[i];
      }

      const issuerKey = new PublicKey(issuer);
      const beneficiaryKey = new PublicKey(beneficiary);

      const [pactPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("pact"),
          issuerKey.toBuffer(),
          beneficiaryKey.toBuffer(),
          Buffer.from(termsHash),
        ],
        PROGRAM_ID
      );

      const [vaultPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), pactPda.toBuffer()],
        PROGRAM_ID
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                instruction: "initialize_pact",
                args: {
                  collateral_amount,
                  expiry_seconds: expiry_hours * 3600,
                  terms_hash: Array.from(termsHash),
                  memo: Array.from(Buffer.from(terms.slice(0, 128))),
                },
                accounts: {
                  issuer,
                  beneficiary,
                  collateralMint: collateral_mint,
                  pact: pactPda.toBase58(),
                  vault: vaultPda.toBase58(),
                  tokenProgram:
                    "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
                  systemProgram: "11111111111111111111111111111111",
                },
                note: "Issuer must have an ATA for the collateral mint with sufficient balance.",
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool 4: pact_settle
  server.tool(
    "pact_settle",
    "Check if a Pact is ready for settlement and return settlement details.",
    {
      pact_address: z.string().describe("Pact escrow pubkey"),
    },
    async ({ pact_address }) => {
      const pact = await getPact(pact_address);
      if (!pact) {
        return {
          content: [
            { type: "text" as const, text: `Pact not found: ${pact_address}` },
          ],
        };
      }

      const ready =
        pact.status === 0 &&
        pact.conditionsFulfilled === pact.conditionCount &&
        pact.conditionCount > 0;

      const now = BigInt(Math.floor(Date.now() / 1000));
      const expired = pact.expiryAt <= now;

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                pact: pact_address,
                status: pact.statusLabel,
                readyToSettle: ready,
                conditions: `${pact.conditionsFulfilled}/${pact.conditionCount}`,
                expired,
                collateral: `${Number(pact.collateralAmount) / 1_000_000} USDC`,
                beneficiary: pact.beneficiary,
                recommendation: ready
                  ? "All conditions met. Beneficiary can call settle_pact."
                  : expired
                    ? "Pact has expired. Anyone can call expire_pact to return collateral."
                    : `${pact.conditionCount - pact.conditionsFulfilled} conditions still pending.`,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  // Tool 5: pact_audit
  server.tool(
    "pact_audit",
    "Generate a complete audit trail for a Pact. Returns full lifecycle with conditions, fulfillments, and transaction signatures.",
    {
      pact_address: z.string().describe("Pact escrow pubkey"),
      include_signatures: z
        .boolean()
        .default(true)
        .describe("Include transaction signatures"),
    },
    async ({ pact_address, include_signatures }) => {
      const pact = await getPact(pact_address);
      if (!pact) {
        return {
          content: [
            { type: "text" as const, text: `Pact not found: ${pact_address}` },
          ],
        };
      }

      const conditions = await getConditions(
        pact_address,
        pact.conditionCount
      );

      let signatures: any[] = [];
      if (include_signatures) {
        const sigs = await getSignatures(pact_address, 50);
        signatures = sigs.map((s) => ({
          signature: s.signature,
          slot: s.slot,
          time: s.blockTime
            ? new Date(s.blockTime * 1000).toISOString()
            : null,
          err: s.err ? JSON.stringify(s.err) : null,
        }));
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                audit: {
                  pact: pact_address,
                  status: pact.statusLabel,
                  issuer: pact.issuer,
                  beneficiary: pact.beneficiary,
                  agentAuthority: pact.agentAuthority,
                  collateral: {
                    mint: pact.collateralMint,
                    amount: `${Number(pact.collateralAmount) / 1_000_000} USDC`,
                  },
                  timeline: {
                    created: new Date(
                      Number(pact.createdAt) * 1000
                    ).toISOString(),
                    expires: new Date(
                      Number(pact.expiryAt) * 1000
                    ).toISOString(),
                    resolved: pact.resolvedAt
                      ? new Date(
                          Number(pact.resolvedAt) * 1000
                        ).toISOString()
                      : null,
                  },
                  termsHash: pact.termsHash,
                  reasoningHash: pact.reasoningHash,
                  memo: pact.memo,
                  pactMint: pact.pactMint,
                  conditions: conditions.map((c) => ({
                    index: c.index,
                    type: c.conditionTypeLabel,
                    fulfilled: c.fulfilled,
                    fulfilledBy: c.fulfilled ? c.fulfilledBy : null,
                    fulfilledAt: c.fulfilled
                      ? new Date(
                          Number(c.fulfilledAt) * 1000
                        ).toISOString()
                      : null,
                    proofHash: c.proofHash,
                    oracle: c.oracle,
                  })),
                  transactionCount: signatures.length,
                  transactions: signatures,
                },
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );
}
