import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "CoiQFqwmZU6KYq6BjMMz3yw9sgb5L8ngusPgtRXGRHi8"
);

export const STATUS_LABELS: Record<number, string> = {
  0: "Active",
  1: "Settled",
  2: "Disputed",
  3: "Expired",
  4: "Cancelled",
  5: "Recalled",
};

export const CONDITION_TYPE_LABELS: Record<number, string> = {
  0: "Manual",
  1: "Agent",
  2: "Oracle",
  3: "TimeBased",
  4: "DocumentVerification",
};

export interface PactAccount {
  address: string;
  issuer: string;
  beneficiary: string;
  agentAuthority: string;
  collateralMint: string;
  collateralAmount: bigint;
  conditionCount: number;
  conditionsFulfilled: number;
  status: number;
  statusLabel: string;
  createdAt: bigint;
  expiryAt: bigint;
  resolvedAt: bigint;
  termsHash: string;
  reasoningHash: string;
  memo: string;
  pactMint: string;
}

export interface ConditionAccount {
  address: string;
  pact: string;
  index: number;
  conditionType: number;
  conditionTypeLabel: string;
  descriptionHash: string;
  fulfilled: boolean;
  fulfilledBy: string;
  fulfilledAt: bigint;
  proofHash: string;
  oracle: string;
  autoFulfillAt: bigint;
}

// Anchor discriminator for Pact account
const PACT_DISCRIMINATOR = Buffer.from([
  // First 8 bytes of SHA256("account:Pact")
  0x2a, 0x4d, 0x61, 0x16, 0x8f, 0x51, 0x2e, 0x6a,
]);

export function deserializePact(
  address: PublicKey,
  data: Buffer
): PactAccount | null {
  if (data.length < 398) return null;

  let offset = 8; // skip discriminator

  const issuer = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const beneficiary = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const agentAuthority = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const collateralMint = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const collateralAmount = data.readBigUInt64LE(offset);
  offset += 8;
  const conditionCount = data.readUInt8(offset);
  offset += 1;
  const conditionsFulfilled = data.readUInt8(offset);
  offset += 1;
  const status = data.readUInt8(offset);
  offset += 1;

  const createdAt = data.readBigInt64LE(offset);
  offset += 8;
  const expiryAt = data.readBigInt64LE(offset);
  offset += 8;
  const resolvedAt = data.readBigInt64LE(offset);
  offset += 8;

  const termsHash = data.subarray(offset, offset + 32).toString("hex");
  offset += 32;
  const reasoningHash = data.subarray(offset, offset + 32).toString("hex");
  offset += 32;

  const memoLen = data.readUInt8(offset + 128);
  const memo = data.subarray(offset, offset + memoLen).toString("utf8");
  offset += 128 + 1; // memo + memo_len

  offset += 1; // bump
  offset += 1; // vault_bump

  const pactMint = new PublicKey(data.subarray(offset, offset + 32));

  return {
    address: address.toBase58(),
    issuer: issuer.toBase58(),
    beneficiary: beneficiary.toBase58(),
    agentAuthority: agentAuthority.toBase58(),
    collateralMint: collateralMint.toBase58(),
    collateralAmount,
    conditionCount,
    conditionsFulfilled,
    status,
    statusLabel: STATUS_LABELS[status] ?? "Unknown",
    createdAt,
    expiryAt,
    resolvedAt,
    termsHash,
    reasoningHash,
    memo,
    pactMint: pactMint.toBase58(),
  };
}

export function deserializeCondition(
  address: PublicKey,
  data: Buffer
): ConditionAccount | null {
  if (data.length < 188) return null;

  let offset = 8; // skip discriminator

  const pact = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const index = data.readUInt8(offset);
  offset += 1;
  const conditionType = data.readUInt8(offset);
  offset += 1;
  const descriptionHash = data.subarray(offset, offset + 32).toString("hex");
  offset += 32;
  const fulfilled = data.readUInt8(offset) === 1;
  offset += 1;
  const fulfilledBy = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const fulfilledAt = data.readBigInt64LE(offset);
  offset += 8;
  const proofHash = data.subarray(offset, offset + 32).toString("hex");
  offset += 32;
  const oracle = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;
  const autoFulfillAt = data.readBigInt64LE(offset);

  return {
    address: address.toBase58(),
    pact: pact.toBase58(),
    index,
    conditionType,
    conditionTypeLabel: CONDITION_TYPE_LABELS[conditionType] ?? "Unknown",
    descriptionHash,
    fulfilled,
    fulfilledBy: fulfilledBy.toBase58(),
    fulfilledAt,
    proofHash,
    oracle: oracle.toBase58(),
    autoFulfillAt,
  };
}
