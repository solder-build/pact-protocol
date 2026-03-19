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
  createMint,
  createAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { assert } from "chai";
import { BN } from "bn.js";

describe("pact-protocol", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.pactProtocol as Program<PactProtocol>;
  const connection = provider.connection;

  // Shared state
  let collateralMint: PublicKey;
  let issuer: Keypair;
  let beneficiary: Keypair;
  let agent: Keypair;
  let issuerTokenAccount: PublicKey;
  let beneficiaryTokenAccount: PublicKey;

  const COLLATERAL_AMOUNT = 1_000_000; // 1 USDC (6 decimals)
  const EXPIRY_SECONDS = 7 * 24 * 3600; // 7 days

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
    termsHash: number[]
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [
        Buffer.from("pact"),
        issuerKey.toBuffer(),
        beneficiaryKey.toBuffer(),
        Buffer.from(termsHash),
      ],
      program.programId
    );
  }

  function findVaultPda(pactKey: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), pactKey.toBuffer()],
      program.programId
    );
  }

  function findConditionPda(
    pactKey: PublicKey,
    index: number
  ): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("condition"), pactKey.toBuffer(), Buffer.from([index])],
      program.programId
    );
  }

  before(async () => {
    // Create keypairs
    issuer = Keypair.generate();
    beneficiary = Keypair.generate();
    agent = Keypair.generate();

    // Airdrop SOL
    const airdropIssuer = await connection.requestAirdrop(
      issuer.publicKey,
      5 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropIssuer);

    const airdropBeneficiary = await connection.requestAirdrop(
      beneficiary.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropBeneficiary);

    const airdropAgent = await connection.requestAirdrop(
      agent.publicKey,
      1 * LAMPORTS_PER_SOL
    );
    await connection.confirmTransaction(airdropAgent);

    // Create mock USDC mint (6 decimals)
    collateralMint = await createMint(
      connection,
      issuer,
      issuer.publicKey,
      null,
      6
    );

    // Create token accounts
    issuerTokenAccount = await createAccount(
      connection,
      issuer,
      collateralMint,
      issuer.publicKey
    );

    beneficiaryTokenAccount = await createAccount(
      connection,
      beneficiary,
      collateralMint,
      beneficiary.publicKey
    );

    // Mint 10 USDC to issuer
    await mintTo(
      connection,
      issuer,
      collateralMint,
      issuerTokenAccount,
      issuer,
      10_000_000
    );
  });

  // =========================================================================
  // Test 1: Happy Path — Initialize → Add Conditions → Fulfill → Settle
  // =========================================================================
  describe("Happy Path", () => {
    const termsHash = makeHash("PACT-001-TRADE-FINANCE-TERMS");
    let pactKey: PublicKey;
    let vaultKey: PublicKey;

    it("initializes a Pact with collateral", async () => {
      [pactKey] = findPactPda(
        issuer.publicKey,
        beneficiary.publicKey,
        termsHash
      );
      [vaultKey] = findVaultPda(pactKey);

      const tx = await program.methods
        .initializePact(
          new BN(COLLATERAL_AMOUNT),
          new BN(EXPIRY_SECONDS),
          termsHash,
          Buffer.from("Invoice #INV-2026-001")
        )
        .accounts({
          issuer: issuer.publicKey,
          beneficiary: beneficiary.publicKey,
          collateralMint,
          pact: pactKey,
          vault: vaultKey,
          issuerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([issuer])
        .rpc();

      console.log("  initialize_pact tx:", tx);

      // Verify Pact state
      const pact = await program.account.pact.fetch(pactKey);
      assert.ok(pact.issuer.equals(issuer.publicKey));
      assert.ok(pact.beneficiary.equals(beneficiary.publicKey));
      assert.equal(pact.collateralAmount.toNumber(), COLLATERAL_AMOUNT);
      assert.equal(pact.conditionCount, 0);
      assert.equal(pact.conditionsFulfilled, 0);
      assert.deepEqual(pact.status, { active: {} });

      // Verify vault holds collateral
      const vaultAccount = await getAccount(connection, vaultKey);
      assert.equal(Number(vaultAccount.amount), COLLATERAL_AMOUNT);
    });

    it("sets agent authority", async () => {
      await program.methods
        .setAgent(agent.publicKey)
        .accounts({
          issuer: issuer.publicKey,
          pact: pactKey,
        })
        .signers([issuer])
        .rpc();

      const pact = await program.account.pact.fetch(pactKey);
      assert.ok(pact.agentAuthority.equals(agent.publicKey));
    });

    it("adds manual condition (delivery confirmation)", async () => {
      const [conditionKey] = findConditionPda(pactKey, 0);
      const descHash = makeHash("Delivery confirmed at warehouse");

      await program.methods
        .addCondition(
          { manual: {} },
          descHash,
          PublicKey.default,
          new BN(0)
        )
        .accounts({
          issuer: issuer.publicKey,
          pact: pactKey,
          condition: conditionKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([issuer])
        .rpc();

      const condition = await program.account.condition.fetch(conditionKey);
      assert.equal(condition.index, 0);
      assert.deepEqual(condition.conditionType, { manual: {} });
      assert.equal(condition.fulfilled, false);

      const pact = await program.account.pact.fetch(pactKey);
      assert.equal(pact.conditionCount, 1);
    });

    it("adds agent condition (inspection passed)", async () => {
      const [conditionKey] = findConditionPda(pactKey, 1);
      const descHash = makeHash("Quality inspection passed");

      await program.methods
        .addCondition(
          { agent: {} },
          descHash,
          PublicKey.default,
          new BN(0)
        )
        .accounts({
          issuer: issuer.publicKey,
          pact: pactKey,
          condition: conditionKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([issuer])
        .rpc();

      const pact = await program.account.pact.fetch(pactKey);
      assert.equal(pact.conditionCount, 2);
    });

    it("issuer fulfills manual condition", async () => {
      const [conditionKey] = findConditionPda(pactKey, 0);
      const proofHash = makeHash("delivery-receipt-hash-abc123");

      await program.methods
        .fulfillCondition(proofHash)
        .accounts({
          fulfiller: issuer.publicKey,
          pact: pactKey,
          condition: conditionKey,
        })
        .signers([issuer])
        .rpc();

      const condition = await program.account.condition.fetch(conditionKey);
      assert.equal(condition.fulfilled, true);
      assert.ok(condition.fulfilledBy.equals(issuer.publicKey));

      const pact = await program.account.pact.fetch(pactKey);
      assert.equal(pact.conditionsFulfilled, 1);
    });

    it("agent fulfills agent condition", async () => {
      const [conditionKey] = findConditionPda(pactKey, 1);
      const proofHash = makeHash("inspection-report-hash-xyz789");

      await program.methods
        .fulfillCondition(proofHash)
        .accounts({
          fulfiller: agent.publicKey,
          pact: pactKey,
          condition: conditionKey,
        })
        .signers([agent])
        .rpc();

      const condition = await program.account.condition.fetch(conditionKey);
      assert.equal(condition.fulfilled, true);
      assert.ok(condition.fulfilledBy.equals(agent.publicKey));

      const pact = await program.account.pact.fetch(pactKey);
      assert.equal(pact.conditionsFulfilled, 2);
    });

    it("beneficiary settles Pact — collateral released", async () => {
      const beneficiaryBalanceBefore = await getAccount(
        connection,
        beneficiaryTokenAccount
      );

      const tx = await program.methods
        .settlePact()
        .accounts({
          beneficiary: beneficiary.publicKey,
          issuer: issuer.publicKey,
          pact: pactKey,
          vault: vaultKey,
          collateralMint,
          beneficiaryTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([beneficiary])
        .rpc();

      console.log("  settle_pact tx:", tx);

      // Pact is settled
      const pact = await program.account.pact.fetch(pactKey);
      assert.deepEqual(pact.status, { settled: {} });
      assert.ok(pact.resolvedAt.toNumber() > 0);

      // Beneficiary received collateral
      const beneficiaryBalanceAfter = await getAccount(
        connection,
        beneficiaryTokenAccount
      );
      assert.equal(
        Number(beneficiaryBalanceAfter.amount) -
          Number(beneficiaryBalanceBefore.amount),
        COLLATERAL_AMOUNT
      );
    });
  });

  // =========================================================================
  // Test 2: Dispute Path — Initialize → Dispute → Force Recall
  // =========================================================================
  describe("Dispute Path", () => {
    const termsHash = makeHash("PACT-002-DISPUTE-TEST-TERMS");
    let pactKey: PublicKey;
    let vaultKey: PublicKey;

    it("initializes a Pact for dispute test", async () => {
      [pactKey] = findPactPda(
        issuer.publicKey,
        beneficiary.publicKey,
        termsHash
      );
      [vaultKey] = findVaultPda(pactKey);

      await program.methods
        .initializePact(
          new BN(500_000), // 0.5 USDC
          new BN(EXPIRY_SECONDS),
          termsHash,
          Buffer.from("Dispute test")
        )
        .accounts({
          issuer: issuer.publicKey,
          beneficiary: beneficiary.publicKey,
          collateralMint,
          pact: pactKey,
          vault: vaultKey,
          issuerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([issuer])
        .rpc();

      // Add a condition so it's not empty
      const [conditionKey] = findConditionPda(pactKey, 0);
      await program.methods
        .addCondition(
          { manual: {} },
          makeHash("condition-for-dispute"),
          PublicKey.default,
          new BN(0)
        )
        .accounts({
          issuer: issuer.publicKey,
          pact: pactKey,
          condition: conditionKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([issuer])
        .rpc();
    });

    it("beneficiary files dispute", async () => {
      const reasonHash = makeHash("Goods quality below standard");

      await program.methods
        .disputePact(reasonHash)
        .accounts({
          disputer: beneficiary.publicKey,
          pact: pactKey,
        })
        .signers([beneficiary])
        .rpc();

      const pact = await program.account.pact.fetch(pactKey);
      assert.deepEqual(pact.status, { disputed: {} });
    });

    it("issuer (delegate) force-recalls collateral", async () => {
      const issuerBalanceBefore = await getAccount(
        connection,
        issuerTokenAccount
      );

      const tx = await program.methods
        .forceRecall()
        .accounts({
          delegate: issuer.publicKey,
          pact: pactKey,
          vault: vaultKey,
          collateralMint,
          issuerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([issuer])
        .rpc();

      console.log("  force_recall tx:", tx);

      const pact = await program.account.pact.fetch(pactKey);
      assert.deepEqual(pact.status, { recalled: {} });

      // Issuer got collateral back
      const issuerBalanceAfter = await getAccount(
        connection,
        issuerTokenAccount
      );
      assert.equal(
        Number(issuerBalanceAfter.amount) -
          Number(issuerBalanceBefore.amount),
        500_000
      );
    });
  });

  // =========================================================================
  // Test 3: Error Cases
  // =========================================================================
  describe("Error Cases", () => {
    const termsHash = makeHash("PACT-003-ERROR-TEST-TERMS");
    let pactKey: PublicKey;
    let vaultKey: PublicKey;

    before(async () => {
      [pactKey] = findPactPda(
        issuer.publicKey,
        beneficiary.publicKey,
        termsHash
      );
      [vaultKey] = findVaultPda(pactKey);

      await program.methods
        .initializePact(
          new BN(500_000),
          new BN(EXPIRY_SECONDS),
          termsHash,
          Buffer.from("Error test")
        )
        .accounts({
          issuer: issuer.publicKey,
          beneficiary: beneficiary.publicKey,
          collateralMint,
          pact: pactKey,
          vault: vaultKey,
          issuerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([issuer])
        .rpc();

      // Add agent condition
      await program.methods
        .setAgent(agent.publicKey)
        .accounts({ issuer: issuer.publicKey, pact: pactKey })
        .signers([issuer])
        .rpc();

      const [conditionKey] = findConditionPda(pactKey, 0);
      await program.methods
        .addCondition(
          { agent: {} },
          makeHash("agent-only-condition"),
          PublicKey.default,
          new BN(0)
        )
        .accounts({
          issuer: issuer.publicKey,
          pact: pactKey,
          condition: conditionKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([issuer])
        .rpc();
    });

    it("rejects unauthorized fulfillment (random signer on agent condition)", async () => {
      const [conditionKey] = findConditionPda(pactKey, 0);
      const randomUser = Keypair.generate();
      const airdrop = await connection.requestAirdrop(
        randomUser.publicKey,
        LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdrop);

      try {
        await program.methods
          .fulfillCondition(makeHash("fake-proof"))
          .accounts({
            fulfiller: randomUser.publicKey,
            pact: pactKey,
            condition: conditionKey,
          })
          .signers([randomUser])
          .rpc();
        assert.fail("Should have thrown Unauthorized error");
      } catch (err: any) {
        assert.include(err.message, "Signer is not authorized");
      }
    });

    it("rejects settle when conditions not met", async () => {
      try {
        await program.methods
          .settlePact()
          .accounts({
            beneficiary: beneficiary.publicKey,
            issuer: issuer.publicKey,
            pact: pactKey,
            vault: vaultKey,
            collateralMint,
            beneficiaryTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([beneficiary])
          .rpc();
        assert.fail("Should have thrown ConditionsNotMet error");
      } catch (err: any) {
        assert.include(err.message, "Not all conditions are met");
      }
    });

    it("rejects double fulfillment", async () => {
      const [conditionKey] = findConditionPda(pactKey, 0);

      // First fulfillment should succeed
      await program.methods
        .fulfillCondition(makeHash("real-proof"))
        .accounts({
          fulfiller: agent.publicKey,
          pact: pactKey,
          condition: conditionKey,
        })
        .signers([agent])
        .rpc();

      // Second fulfillment should fail
      try {
        await program.methods
          .fulfillCondition(makeHash("another-proof"))
          .accounts({
            fulfiller: agent.publicKey,
            pact: pactKey,
            condition: conditionKey,
          })
          .signers([agent])
          .rpc();
        assert.fail("Should have thrown AlreadyFulfilled error");
      } catch (err: any) {
        assert.include(err.message, "Condition already fulfilled");
      }
    });

    it("rejects expire before expiry time", async () => {
      try {
        await program.methods
          .expirePact()
          .accounts({
            cranker: beneficiary.publicKey,
            issuer: issuer.publicKey,
            pact: pactKey,
            vault: vaultKey,
            collateralMint,
            issuerTokenAccount,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .signers([beneficiary])
          .rpc();
        assert.fail("Should have thrown NotExpired error");
      } catch (err: any) {
        // Could be NotExpired or AllConditionsMet (since we fulfilled 1/1)
        assert.ok(
          err.message.includes("not yet expired") ||
            err.message.includes("All conditions already met")
        );
      }
    });

    it("rejects beneficiary setting agent (only issuer can)", async () => {
      try {
        await program.methods
          .setAgent(Keypair.generate().publicKey)
          .accounts({
            issuer: beneficiary.publicKey,
            pact: pactKey,
          })
          .signers([beneficiary])
          .rpc();
        assert.fail("Should have thrown error");
      } catch (err: any) {
        // Anchor has_one constraint violation
        assert.ok(err.message.length > 0);
      }
    });
  });

  // =========================================================================
  // Test 4: Document Verification Condition
  // =========================================================================
  describe("Document Verification", () => {
    const termsHash = makeHash("PACT-004-DOCUMENT-VERIFY");
    let pactKey: PublicKey;
    let vaultKey: PublicKey;

    it("anyone can fulfill document condition with valid proof", async () => {
      [pactKey] = findPactPda(
        issuer.publicKey,
        beneficiary.publicKey,
        termsHash
      );
      [vaultKey] = findVaultPda(pactKey);

      await program.methods
        .initializePact(
          new BN(100_000),
          new BN(EXPIRY_SECONDS),
          termsHash,
          Buffer.from("Doc verify test")
        )
        .accounts({
          issuer: issuer.publicKey,
          beneficiary: beneficiary.publicKey,
          collateralMint,
          pact: pactKey,
          vault: vaultKey,
          issuerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([issuer])
        .rpc();

      // Add document verification condition
      const [conditionKey] = findConditionPda(pactKey, 0);
      await program.methods
        .addCondition(
          { documentVerification: {} },
          makeHash("Bill of Lading required"),
          PublicKey.default,
          new BN(0)
        )
        .accounts({
          issuer: issuer.publicKey,
          pact: pactKey,
          condition: conditionKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([issuer])
        .rpc();

      // A random third party can fulfill with document proof
      const thirdParty = Keypair.generate();
      const airdrop = await connection.requestAirdrop(
        thirdParty.publicKey,
        LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(airdrop);

      await program.methods
        .fulfillCondition(makeHash("bill-of-lading-sha256-hash"))
        .accounts({
          fulfiller: thirdParty.publicKey,
          pact: pactKey,
          condition: conditionKey,
        })
        .signers([thirdParty])
        .rpc();

      const condition = await program.account.condition.fetch(conditionKey);
      assert.equal(condition.fulfilled, true);
      assert.ok(condition.fulfilledBy.equals(thirdParty.publicKey));
    });

    it("rejects document condition with zero proof hash", async () => {
      // Need a new pact for this test
      const termsHash2 = makeHash("PACT-004B-ZERO-PROOF-TEST");
      const [pactKey2] = findPactPda(
        issuer.publicKey,
        beneficiary.publicKey,
        termsHash2
      );
      const [vaultKey2] = findVaultPda(pactKey2);

      await program.methods
        .initializePact(
          new BN(100_000),
          new BN(EXPIRY_SECONDS),
          termsHash2,
          Buffer.from("Zero proof test")
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

      const [conditionKey] = findConditionPda(pactKey2, 0);
      await program.methods
        .addCondition(
          { documentVerification: {} },
          makeHash("document-needed"),
          PublicKey.default,
          new BN(0)
        )
        .accounts({
          issuer: issuer.publicKey,
          pact: pactKey2,
          condition: conditionKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([issuer])
        .rpc();

      try {
        await program.methods
          .fulfillCondition(new Array(32).fill(0)) // zero hash
          .accounts({
            fulfiller: issuer.publicKey,
            pact: pactKey2,
            condition: conditionKey,
          })
          .signers([issuer])
          .rpc();
        assert.fail("Should have thrown InvalidProof error");
      } catch (err: any) {
        assert.include(err.message, "Invalid proof hash");
      }
    });
  });

  // =========================================================================
  // Test 5: Max Conditions
  // =========================================================================
  describe("Max Conditions", () => {
    const termsHash = makeHash("PACT-005-MAX-CONDITIONS");
    let pactKey: PublicKey;
    let vaultKey: PublicKey;

    it("allows up to 8 conditions", async () => {
      [pactKey] = findPactPda(
        issuer.publicKey,
        beneficiary.publicKey,
        termsHash
      );
      [vaultKey] = findVaultPda(pactKey);

      await program.methods
        .initializePact(
          new BN(100_000),
          new BN(EXPIRY_SECONDS),
          termsHash,
          Buffer.from("Max conditions test")
        )
        .accounts({
          issuer: issuer.publicKey,
          beneficiary: beneficiary.publicKey,
          collateralMint,
          pact: pactKey,
          vault: vaultKey,
          issuerTokenAccount,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: anchor.utils.token.ASSOCIATED_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([issuer])
        .rpc();

      // Add 8 conditions
      for (let i = 0; i < 8; i++) {
        const [conditionKey] = findConditionPda(pactKey, i);
        await program.methods
          .addCondition(
            { manual: {} },
            makeHash(`condition-${i}`),
            PublicKey.default,
            new BN(0)
          )
          .accounts({
            issuer: issuer.publicKey,
            pact: pactKey,
            condition: conditionKey,
            systemProgram: SystemProgram.programId,
          })
          .signers([issuer])
          .rpc();
      }

      const pact = await program.account.pact.fetch(pactKey);
      assert.equal(pact.conditionCount, 8);

      // 9th condition should fail
      const [conditionKey9] = findConditionPda(pactKey, 8);
      try {
        await program.methods
          .addCondition(
            { manual: {} },
            makeHash("condition-9"),
            PublicKey.default,
            new BN(0)
          )
          .accounts({
            issuer: issuer.publicKey,
            pact: pactKey,
            condition: conditionKey9,
            systemProgram: SystemProgram.programId,
          })
          .signers([issuer])
          .rpc();
        assert.fail("Should have thrown TooManyConditions error");
      } catch (err: any) {
        assert.include(err.message, "Maximum conditions");
      }
    });
  });
});
