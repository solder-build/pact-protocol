import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PactProtocol } from "../target/types/pact_protocol";
import {
  Keypair,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createMint,
  createAccount,
  mintTo,
  getAccount,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { BN } from "bn.js";

// ---------------------------------------------------------------------------
// ANSI Colors
// ---------------------------------------------------------------------------
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const WHITE = "\x1b[37m";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function shortSig(sig: string): string {
  return sig.slice(0, 8) + "..." + sig.slice(-8);
}

function makeHash(input: string): number[] {
  const hash = new Uint8Array(32);
  const bytes = Buffer.from(input, "utf-8");
  for (let i = 0; i < Math.min(bytes.length, 32); i++) {
    hash[i] = bytes[i];
  }
  return Array.from(hash);
}

function findPactPda(
  issuerKey: PublicKey,
  beneficiaryKey: PublicKey,
  termsHash: number[],
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("pact"),
      issuerKey.toBuffer(),
      beneficiaryKey.toBuffer(),
      Buffer.from(termsHash),
    ],
    programId
  );
}

function findVaultPda(
  pactKey: PublicKey,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), pactKey.toBuffer()],
    programId
  );
}

function findConditionPda(
  pactKey: PublicKey,
  index: number,
  programId: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("condition"), pactKey.toBuffer(), Buffer.from([index])],
    programId
  );
}

function printHeader(title: string) {
  const line = "═".repeat(60);
  console.log(`\n${CYAN}╔${line}╗${RESET}`);
  console.log(
    `${CYAN}║${RESET} ${BOLD}${WHITE}${title.padEnd(58)}${RESET} ${CYAN}║${RESET}`
  );
  console.log(`${CYAN}╚${line}╝${RESET}\n`);
}

function printStep(step: number, msg: string) {
  console.log(`  ${CYAN}[${step}]${RESET} ${msg}`);
}

function printSuccess(msg: string) {
  console.log(`      ${GREEN}✓ ${msg}${RESET}`);
}

function printInfo(label: string, value: string) {
  console.log(`      ${DIM}${label}:${RESET} ${value}`);
}

function printTx(sig: string) {
  console.log(`      ${DIM}tx: ${shortSig(sig)}${RESET}`);
}

function printWarning(msg: string) {
  console.log(`      ${YELLOW}! ${msg}${RESET}`);
}

function formatUsdc(amount: number): string {
  return `$${(amount / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Main Demo
// ---------------------------------------------------------------------------
async function main() {
  const startTime = Date.now();

  console.log(`\n${BOLD}${CYAN}`);
  console.log(`  ██████╗  █████╗  ██████╗████████╗`);
  console.log(`  ██╔══██╗██╔══██╗██╔════╝╚══██╔══╝`);
  console.log(`  ██████╔╝███████║██║        ██║   `);
  console.log(`  ██╔═══╝ ██╔══██║██║        ██║   `);
  console.log(`  ██║     ██║  ██║╚██████╗   ██║   `);
  console.log(`  ╚═╝     ╚═╝  ╚═╝ ╚═════╝   ╚═╝   `);
  console.log(`${RESET}`);
  console.log(
    `  ${DIM}Programmable Letters of Credit on Solana${RESET}`
  );
  console.log(
    `  ${DIM}Token-2022 | DefaultFrozen | PermanentDelegate${RESET}\n`
  );

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .pactProtocol as Program<PactProtocol>;
  const connection = provider.connection;
  const programId = program.programId;

  // =========================================================================
  // Setup
  // =========================================================================
  printHeader("SETUP: Creating Wallets & Mock USDC");

  const issuer = Keypair.generate();
  const beneficiary = Keypair.generate();
  const agent = Keypair.generate();

  printStep(1, "Airdropping SOL to wallets...");
  for (const [name, kp, amount] of [
    ["AMINA Bank (Issuer)", issuer, 5],
    ["Zurich Corp (Beneficiary)", beneficiary, 2],
    ["Cortex AI (Agent)", agent, 1],
  ] as const) {
    const sig = await connection.requestAirdrop(
      kp.publicKey,
      amount * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(sig);
    printInfo(name as string, `${kp.publicKey.toBase58().slice(0, 16)}...`);
  }
  await sleep(150);

  printStep(2, "Creating mock USDC mint (6 decimals)...");
  const collateralMint = await createMint(
    connection,
    issuer,
    issuer.publicKey,
    null,
    6
  );
  printInfo("Mint", collateralMint.toBase58());

  const issuerTokenAccount = await createAccount(
    connection,
    issuer,
    collateralMint,
    issuer.publicKey
  );
  const beneficiaryTokenAccount = await createAccount(
    connection,
    beneficiary,
    collateralMint,
    beneficiary.publicKey
  );

  // Mint 20,000 USDC to issuer
  await mintTo(
    connection,
    issuer,
    collateralMint,
    issuerTokenAccount,
    issuer,
    20_000_000_000
  );
  printSuccess("Issuer funded with 20,000 USDC");
  await sleep(150);

  // =========================================================================
  // Scenario 1: Happy Path — OTC Stablecoin Settlement
  // =========================================================================
  printHeader("SCENARIO 1: OTC Stablecoin Settlement (Happy Path)");

  const termsHash1 = makeHash("AMINA-ZURICH-OTC-SETTLEMENT-001");
  const [pactKey1] = findPactPda(
    issuer.publicKey,
    beneficiary.publicKey,
    termsHash1,
    programId
  );
  const [vaultKey1] = findVaultPda(pactKey1, programId);
  const AMOUNT_1 = 10_000_000_000; // 10,000 USDC

  printStep(1, "Creating Pact: AMINA locks 10,000 USDC for Zurich Corp...");
  let tx = await program.methods
    .initializePact(
      new BN(AMOUNT_1),
      new BN(7 * 24 * 3600),
      termsHash1,
      Buffer.from("OTC USDC Settlement #001")
    )
    .accounts({
      issuer: issuer.publicKey,
      beneficiary: beneficiary.publicKey,
      collateralMint,
      pact: pactKey1,
      vault: vaultKey1,
      issuerTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([issuer])
    .rpc();
  printSuccess(`Pact created — ${formatUsdc(AMOUNT_1)} locked in escrow`);
  printInfo("Pact", pactKey1.toBase58());
  printTx(tx);
  await sleep(150);

  // Create Pact Mint (Token-2022)
  printStep(2, "Creating Token-2022 Pact mint (DefaultFrozen + PermanentDelegate)...");
  const pactMint1 = Keypair.generate();
  const beneficiaryPactToken1 = getAssociatedTokenAddressSync(
    pactMint1.publicKey,
    beneficiary.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  try {
    tx = await program.methods
      .createPactMint()
      .accounts({
        issuer: issuer.publicKey,
        pact: pactKey1,
        pactMint: pactMint1.publicKey,
        beneficiary: beneficiary.publicKey,
        beneficiaryPactToken: beneficiaryPactToken1,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([issuer, pactMint1])
      .rpc();

    printSuccess("Token-2022 Pact mint created");
    printInfo("Extensions", "DefaultFrozen + PermanentDelegate");
    printInfo("Pact Mint", pactMint1.publicKey.toBase58());

    const tokenAcct = await getAccount(
      connection,
      beneficiaryPactToken1,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    printInfo("Beneficiary token", `amount=${tokenAcct.amount}, frozen=${tokenAcct.isFrozen}`);
    printTx(tx);
  } catch (e: any) {
    printWarning("Token-2022 mint creation skipped: " + e.message?.slice(0, 80));
  }
  await sleep(150);

  // Set agent
  printStep(3, "Authorizing Cortex AI agent...");
  tx = await program.methods
    .setAgent(agent.publicKey)
    .accounts({ issuer: issuer.publicKey, pact: pactKey1 })
    .signers([issuer])
    .rpc();
  printSuccess("Agent authorized: Cortex AI");
  printTx(tx);
  await sleep(150);

  // Add conditions
  printStep(4, "Adding conditions...");

  const [cond0] = findConditionPda(pactKey1, 0, programId);
  await program.methods
    .addCondition(
      { manual: {} },
      makeHash("Delivery confirmed at Zurich warehouse"),
      PublicKey.default,
      new BN(0)
    )
    .accounts({
      issuer: issuer.publicKey,
      pact: pactKey1,
      condition: cond0,
      systemProgram: SystemProgram.programId,
    })
    .signers([issuer])
    .rpc();
  printSuccess("Condition 0: Manual — Delivery confirmation");

  const [cond1] = findConditionPda(pactKey1, 1, programId);
  await program.methods
    .addCondition(
      { agent: {} },
      makeHash("Quality inspection by Cortex AI"),
      PublicKey.default,
      new BN(0)
    )
    .accounts({
      issuer: issuer.publicKey,
      pact: pactKey1,
      condition: cond1,
      systemProgram: SystemProgram.programId,
    })
    .signers([issuer])
    .rpc();
  printSuccess("Condition 1: Agent — Quality inspection (Cortex AI)");
  await sleep(150);

  // Fulfill conditions
  printStep(5, "Fulfilling conditions...");

  await program.methods
    .fulfillCondition(makeHash("delivery-receipt-SHA256-abc123"))
    .accounts({
      fulfiller: issuer.publicKey,
      pact: pactKey1,
      condition: cond0,
    })
    .signers([issuer])
    .rpc();
  printSuccess("Condition 0 fulfilled by AMINA Bank (delivery receipt)");

  await program.methods
    .fulfillCondition(makeHash("inspection-report-SHA256-xyz789"))
    .accounts({
      fulfiller: agent.publicKey,
      pact: pactKey1,
      condition: cond1,
    })
    .signers([agent])
    .rpc();
  printSuccess("Condition 1 fulfilled by Cortex AI (inspection passed)");

  let pact = await program.account.pact.fetch(pactKey1);
  printInfo("Conditions", `${pact.conditionsFulfilled}/${pact.conditionCount} fulfilled`);
  await sleep(150);

  // Settle
  printStep(6, "Settling Pact — releasing collateral to Zurich Corp...");

  const benefBefore = await getAccount(connection, beneficiaryTokenAccount);

  tx = await program.methods
    .settlePact()
    .accounts({
      beneficiary: beneficiary.publicKey,
      issuer: issuer.publicKey,
      pact: pactKey1,
      vault: vaultKey1,
      collateralMint,
      beneficiaryTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([beneficiary])
    .rpc();

  const benefAfter = await getAccount(connection, beneficiaryTokenAccount);
  const received = Number(benefAfter.amount) - Number(benefBefore.amount);

  printSuccess(`SETTLED — ${formatUsdc(received)} released to Zurich Corp`);
  printTx(tx);
  await sleep(150);

  // Thaw Pact Token
  printStep(7, "Thawing Pact token — settlement claim now transferable...");

  try {
    tx = await program.methods
      .thawPactToken()
      .accounts({
        beneficiary: beneficiary.publicKey,
        pact: pactKey1,
        pactMintAccount: pactMint1.publicKey,
        beneficiaryPactToken: beneficiaryPactToken1,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers([beneficiary])
      .rpc();

    const tokenAcct = await getAccount(
      connection,
      beneficiaryPactToken1,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    printSuccess(`Pact token THAWED — frozen=${tokenAcct.isFrozen}, amount=${tokenAcct.amount}`);
    printTx(tx);
  } catch (e: any) {
    printWarning("Thaw skipped: " + e.message?.slice(0, 80));
  }

  console.log(`\n  ${GREEN}${BOLD}SCENARIO 1 COMPLETE${RESET}`);
  console.log(
    `  ${DIM}Pact issued, conditions fulfilled, settled, token thawed.${RESET}\n`
  );
  await sleep(300);

  // =========================================================================
  // Scenario 2: Dispute → Force Recall → Burn
  // =========================================================================
  printHeader("SCENARIO 2: Dispute + Force Recall (Sanctions Enforcement)");

  const termsHash2 = makeHash("AMINA-FLAGGED-COUNTERPARTY-002");
  const [pactKey2] = findPactPda(
    issuer.publicKey,
    beneficiary.publicKey,
    termsHash2,
    programId
  );
  const [vaultKey2] = findVaultPda(pactKey2, programId);
  const AMOUNT_2 = 5_000_000_000; // 5,000 USDC

  printStep(1, "Creating Pact: AMINA locks 5,000 USDC...");
  tx = await program.methods
    .initializePact(
      new BN(AMOUNT_2),
      new BN(7 * 24 * 3600),
      termsHash2,
      Buffer.from("Flagged counterparty test")
    )
    .accounts({
      issuer: issuer.publicKey,
      beneficiary: beneficiary.publicKey,
      collateralMint,
      pact: pactKey2,
      vault: vaultKey2,
      issuerTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .signers([issuer])
    .rpc();
  printSuccess(`Pact created — ${formatUsdc(AMOUNT_2)} locked`);
  printTx(tx);
  await sleep(150);

  // Create Pact Mint
  printStep(2, "Creating Token-2022 Pact mint...");
  const pactMint2 = Keypair.generate();
  const beneficiaryPactToken2 = getAssociatedTokenAddressSync(
    pactMint2.publicKey,
    beneficiary.publicKey,
    false,
    TOKEN_2022_PROGRAM_ID
  );

  try {
    await program.methods
      .createPactMint()
      .accounts({
        issuer: issuer.publicKey,
        pact: pactKey2,
        pactMint: pactMint2.publicKey,
        beneficiary: beneficiary.publicKey,
        beneficiaryPactToken: beneficiaryPactToken2,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([issuer, pactMint2])
      .rpc();
    printSuccess("Pact mint created (frozen token minted to beneficiary)");
  } catch (e: any) {
    printWarning("Mint creation skipped");
  }
  await sleep(150);

  // Add condition
  const [cond2_0] = findConditionPda(pactKey2, 0, programId);
  await program.methods
    .addCondition(
      { manual: {} },
      makeHash("KYC re-verification pending"),
      PublicKey.default,
      new BN(0)
    )
    .accounts({
      issuer: issuer.publicKey,
      pact: pactKey2,
      condition: cond2_0,
      systemProgram: SystemProgram.programId,
    })
    .signers([issuer])
    .rpc();

  // Dispute
  printStep(3, `${RED}SANCTIONS ALERT — Counterparty flagged!${RESET}`);
  tx = await program.methods
    .disputePact(makeHash("OFAC sanctions list match detected"))
    .accounts({
      disputer: issuer.publicKey,
      pact: pactKey2,
    })
    .signers([issuer])
    .rpc();
  printSuccess(`${YELLOW}DISPUTE FILED — Pact frozen pending investigation${RESET}`);
  printTx(tx);
  await sleep(200);

  // Force recall
  printStep(4, "Force recalling collateral to issuer...");

  const issuerBefore = await getAccount(connection, issuerTokenAccount);

  tx = await program.methods
    .forceRecall()
    .accounts({
      delegate: issuer.publicKey,
      pact: pactKey2,
      vault: vaultKey2,
      collateralMint,
      issuerTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
    })
    .signers([issuer])
    .rpc();

  const issuerAfter = await getAccount(connection, issuerTokenAccount);
  const returned = Number(issuerAfter.amount) - Number(issuerBefore.amount);

  printSuccess(`RECALLED — ${formatUsdc(returned)} returned to AMINA Bank`);
  printTx(tx);
  await sleep(150);

  // Burn Pact token
  printStep(5, "Burning Pact token via permanent delegate...");
  try {
    tx = await program.methods
      .burnPactToken()
      .accounts({
        delegate: issuer.publicKey,
        pact: pactKey2,
        pactMintAccount: pactMint2.publicKey,
        beneficiaryPactToken: beneficiaryPactToken2,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers([issuer])
      .rpc();

    const tokenAcct = await getAccount(
      connection,
      beneficiaryPactToken2,
      undefined,
      TOKEN_2022_PROGRAM_ID
    );
    printSuccess(
      `${RED}PACT TOKEN BURNED${RESET} — settlement claim destroyed (amount=${tokenAcct.amount})`
    );
    printTx(tx);
  } catch (e: any) {
    printWarning("Burn skipped: " + e.message?.slice(0, 80));
  }

  console.log(`\n  ${RED}${BOLD}SCENARIO 2 COMPLETE${RESET}`);
  console.log(
    `  ${DIM}Sanctions detected, collateral recalled, Pact token burned.${RESET}\n`
  );

  // =========================================================================
  // Summary
  // =========================================================================
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  printHeader("DEMO COMPLETE");
  console.log(`  ${DIM}Total execution time: ${elapsed}s${RESET}`);
  console.log(`  ${DIM}Program: ${programId.toBase58()}${RESET}`);
  console.log(`  ${DIM}Network: localnet${RESET}\n`);

  console.log(`  ${BOLD}What you just saw:${RESET}`);
  console.log(`  ${GREEN}1.${RESET} Collateral locked in PDA escrow vault`);
  console.log(`  ${GREEN}2.${RESET} Token-2022 mint with DefaultFrozen + PermanentDelegate`);
  console.log(`  ${GREEN}3.${RESET} Multi-condition fulfillment (Manual + AI Agent)`);
  console.log(`  ${GREEN}4.${RESET} Atomic settlement with token thaw`);
  console.log(`  ${RED}5.${RESET} Sanctions enforcement: dispute → recall → burn`);
  console.log(
    `\n  ${DIM}Pact Protocol — programmable letters of credit on Solana${RESET}\n`
  );
}

main().catch((err) => {
  console.error(`\n${RED}Demo failed:${RESET}`, err);
  process.exit(1);
});
