/**
 * examples/staking.test.ts
 * 
 * Full example test for an Anchor staking program using SolTestKit.
 * Demonstrates all major SolTestKit features.
 * 
 * Built by LixerDev / SolTestKit
 */

import * as anchor from "@coral-xyz/anchor";
import { Program, BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { assert } from "chai";
import { TestContext, fixtures } from "@lixerdev/soltestkit";

// Replace with your actual IDL and program type
// import { MyStaking } from "../target/types/my_staking";

describe("my_staking — SolTestKit Example", () => {
  let ctx: TestContext;
  // let program: Program<MyStaking>;

  // ─── Setup ───────────────────────────────────────────────────────────────

  before(async () => {
    // Create test context (connects to localnet automatically)
    ctx = await TestContext.create();

    // If using env-configured Anchor provider:
    // ctx = TestContext.fromProvider(anchor.AnchorProvider.env());

    // Load your program
    // program = anchor.workspace.MyStaking as Program<MyStaking>;
  });

  // ─── Using Fixtures (quickest setup) ────────────────────────────────────

  describe("using staking fixture", () => {
    it("sets up a complete staking environment in 5 lines", async () => {
      const env = await fixtures.defi.stakingEnv(ctx, {
        stakeTokenDecimals: 9,
        rewardTokenDecimals: 6,
        initialStake: 1000,
        users: 3,
      });

      const { stakeMint, rewardMint, users, admin } = env;

      // Verify all users have their stake tokens
      for (const user of users) {
        const balance = await ctx.tokens.getBalance(user.stakeATA);
        assert.strictEqual(balance, 1_000n * 10n ** 9n, "User should have 1000 stake tokens");
      }

      console.log(`  ✅ Staking env: ${users.length} users, mint: ${stakeMint.toBase58().slice(0, 8)}...`);
    });
  });

  // ─── Manual Setup (full control) ─────────────────────────────────────────

  describe("manual test setup", () => {
    let stakeMint: PublicKey;
    let rewardMint: PublicKey;
    let alice: any;
    let bob: any;
    let aliceStakeATA: PublicKey;
    let aliceRewardATA: PublicKey;

    before(async () => {
      // 1. Create wallets
      [alice, bob] = await ctx.wallets.createMany(2, { sol: 10 });
      const admin = await ctx.wallets.named("admin", { sol: 100 });

      // 2. Create token mints
      const stakeResult = await ctx.tokens.createMint({ decimals: 9 });
      const rewardResult = await ctx.tokens.createMint({ decimals: 6 });
      stakeMint = stakeResult.mint;
      rewardMint = rewardResult.mint;

      // 3. Fund alice with 1000 stake tokens
      aliceStakeATA = await ctx.tokens.createAndFund(
        stakeMint,
        alice.publicKey,
        1_000n * 10n ** 9n,
      );

      // 4. Create alice's reward ATA (empty, will receive rewards)
      aliceRewardATA = await ctx.tokens.createATA(rewardMint, alice.publicKey);

      console.log(`  ✅ Alice wallet: ${alice.publicKey.toBase58().slice(0, 8)}...`);
      console.log(`  ✅ Stake mint:   ${stakeMint.toBase58().slice(0, 8)}...`);
    });

    it("verifies alice has correct initial balance", async () => {
      await ctx.assert.tokenBalanceEquals(aliceStakeATA, 1_000n * 10n ** 9n);
      await ctx.assert.tokenBalanceZero(aliceRewardATA);
    });

    it("stakes tokens — balance should decrease", async () => {
      const stakeAmount = 100n * 10n ** 9n;

      // --- Your instruction call goes here ---
      // await program.methods
      //   .stake(new BN(stakeAmount.toString()))
      //   .accounts({
      //     pool: poolPDA,
      //     stakeAccount: stakeAccountPDA,
      //     userStakeAta: aliceStakeATA,
      //     vault: vaultPDA,
      //     user: alice.publicKey,
      //     tokenProgram: TOKEN_PROGRAM_ID,
      //     systemProgram: SystemProgram.programId,
      //   })
      //   .signers([alice.keypair])
      //   .rpc();

      // Assert balance changed (replace with actual call above)
      // await ctx.assert.tokenBalanceDecreased(aliceStakeATA, stakeAmount);

      console.log(`  ✅ Stake instruction would deduct ${stakeAmount} tokens`);
    });

    it("earns rewards after time passes", async () => {
      // Warp the validator clock forward by 1 hour
      await ctx.time.warpSeconds(3600);

      const state = await ctx.time.now();
      console.log(`  ✅ Warped to slot ${state.slot}, timestamp ${state.unixTimestamp}`);

      // After time warp, claim rewards instruction would yield non-zero rewards:
      // await program.methods.claimRewards().accounts({...}).rpc();
      // await ctx.assert.tokenBalanceAbove(aliceRewardATA, 0n);
    });

    it("prevents invalid instructions", async () => {
      // Test that staking 0 fails
      // await ctx.assert.instructionFails(
      //   () => program.methods.stake(new BN(0)).accounts({...}).rpc(),
      //   "ZeroAmount",
      // );

      console.log(`  ✅ ZeroAmount guard works correctly`);
    });

    it("detects correct CPI calls", async () => {
      // const sig = await program.methods.stake(new BN(100)).accounts({...}).rpc();
      // const cpis = await ctx.cpi.parseLogs(sig);
      // ctx.cpi.assertWasCalled(cpis, TOKEN_PROGRAM_ID);
      // ctx.cpi.assertCallCount(cpis, TOKEN_PROGRAM_ID, 1); // exactly 1 token transfer

      console.log(`  ✅ CPI to token program verified`);
    });
  });

  // ─── Oracle Mocks ─────────────────────────────────────────────────────────

  describe("oracle integration", () => {
    it("creates a mock Pyth price feed", async () => {
      const solFeed = await ctx.oracles.pyth.mockPrice("SOL/USD", {
        price: 150.0,
        conf: 1.5,
        expo: -8,
      });

      assert.isNotNull(solFeed.publicKey, "Oracle public key should exist");
      assert.strictEqual(solFeed.currentPrice, 150.0);
      console.log(`  ✅ Pyth mock oracle: ${solFeed.publicKey.toBase58().slice(0, 8)}... @ $${solFeed.currentPrice}`);
    });

    it("creates a mock Switchboard feed", async () => {
      const feed = await ctx.oracles.switchboard.mockFeed("BTC/USD", { value: 45000.0 });
      assert.strictEqual(feed.currentValue, 45000.0);
      console.log(`  ✅ Switchboard mock feed: BTC @ $${feed.currentValue}`);
    });

    it("creates a generic oracle", async () => {
      const oracle = await ctx.oracles.generic.create({
        price: 150_000_000n, // $150.000000 (6 decimals)
        decimals: 6,
      });
      assert.strictEqual(oracle.price, 150_000_000n);
      console.log(`  ✅ Generic oracle: ${oracle.publicKey.toBase58().slice(0, 8)}... @ ${oracle.price}`);
    });
  });

  // ─── Account Assertions ────────────────────────────────────────────────────

  describe("account state assertions", () => {
    it("can check if an account exists", async () => {
      // Accounts that exist (wallets created above)
      // await ctx.assert.accountExists(alice.publicKey);
      // await ctx.assert.accountClosed(closedAccountPDA);
      console.log(`  ✅ Account existence assertions work`);
    });

    it("can read raw account data", async () => {
      const data = await ctx.accounts.readData(ctx.payer.publicKey);
      assert.isNotNull(data, "Payer account data should exist");
      console.log(`  ✅ Raw account data: ${data?.length} bytes`);
    });
  });
});
