import { Connection, PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID,
  PactAccount,
  ConditionAccount,
  deserializePact,
  deserializeCondition,
} from "./types.js";

const RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export const connection = new Connection(RPC_URL, "confirmed");

export async function getPactAccounts(
  filter?: { issuer?: string; status?: number }
): Promise<PactAccount[]> {
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [{ dataSize: 398 + 8 }], // Pact account size with discriminator
  });

  const pacts: PactAccount[] = [];
  for (const { pubkey, account } of accounts) {
    const pact = deserializePact(pubkey, account.data as Buffer);
    if (!pact) continue;
    if (filter?.issuer && pact.issuer !== filter.issuer) continue;
    if (filter?.status !== undefined && pact.status !== filter.status) continue;
    pacts.push(pact);
  }

  return pacts;
}

export async function getPact(
  address: string
): Promise<PactAccount | null> {
  const pubkey = new PublicKey(address);
  const info = await connection.getAccountInfo(pubkey);
  if (!info) return null;
  return deserializePact(pubkey, info.data as Buffer);
}

export async function getConditions(
  pactAddress: string,
  conditionCount: number
): Promise<ConditionAccount[]> {
  const pactKey = new PublicKey(pactAddress);
  const conditions: ConditionAccount[] = [];

  for (let i = 0; i < conditionCount; i++) {
    const [conditionPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from("condition"),
        pactKey.toBuffer(),
        Buffer.from([i]),
      ],
      PROGRAM_ID
    );

    const info = await connection.getAccountInfo(conditionPda);
    if (!info) continue;

    const cond = deserializeCondition(conditionPda, info.data as Buffer);
    if (cond) conditions.push(cond);
  }

  return conditions;
}

export async function getSignatures(address: string, limit = 20) {
  const pubkey = new PublicKey(address);
  return connection.getSignaturesForAddress(pubkey, { limit });
}
