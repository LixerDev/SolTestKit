/**
 * examples/basic.test.ts
 * 
 * Minimal SolTestKit example — just wallets, tokens, and assertions.
 * Built by LixerDev / SolTestKit
 */

import { assert } from "chai";
import { TestContext } from "@lixerdev/soltestkit";

describe("SolTestKit — Basic Usage", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await TestContext.create();
  });

  it("creates funded wallets", async () => {
    const [alice, bob] = await ctx.wallets.createMany(2, { sol: 5 });

    const aliceBal = await ctx.wallets.getBalance(alice);
    const bobBal = await ctx.wallets.getBalance(bob);

    assert.isAtLeast(aliceBal, 4.9); // allow for tx fees
    assert.isAtLeast(bobBal, 4.9);
    console.log(`  ✅ Alice: ${aliceBal.toFixed(2)} SOL | Bob: ${bobBal.toFixed(2)} SOL`);
  });

  it("creates and funds SPL token accounts", async () => {
    const alice = await ctx.wallets.create({ sol: 2 });
    const { mint } = await ctx.tokens.createMint({ decimals: 9 });
    const ata = await ctx.tokens.createAndFund(mint, alice.publicKey, 500n * 10n ** 9n);

    await ctx.assert.tokenBalanceEquals(ata, 500n * 10n ** 9n);
    console.log(`  ✅ Alice ATA has 500 tokens`);
  });

  it("creates full token scenarios", async () => {
    const [alice, bob] = await ctx.wallets.createMany(2, { sol: 2 });
    const { mint, accounts } = await ctx.tokens.scenario({
      decimals: 6,
      holders: [
        { owner: alice.publicKey, amount: 1_000_000n },
        { owner: bob.publicKey,   amount: 500_000n },
      ],
    });

    const aliceATA = accounts.get(alice.publicKey.toBase58())!;
    const bobATA   = accounts.get(bob.publicKey.toBase58())!;

    await ctx.assert.tokenBalanceEquals(aliceATA, 1_000_000n);
    await ctx.assert.tokenBalanceEquals(bobATA,   500_000n);
    console.log(`  ✅ Token scenario: Alice=1M, Bob=500K`);
  });

  it("creates a named wallet (persistent across tests)", async () => {
    const deployer = await ctx.wallets.named("deployer", { sol: 100 });
    const deployer2 = await ctx.wallets.named("deployer"); // same instance

    assert.strictEqual(
      deployer.publicKey.toBase58(),
      deployer2!.publicKey.toBase58(),
      "Named wallet should be same instance",
    );
    console.log(`  ✅ Named wallet: deployer = ${deployer.publicKey.toBase58().slice(0, 8)}...`);
  });

  it("warps the validator clock", async () => {
    const before = await ctx.time.now();
    await ctx.time.warpSeconds(3600);
    const after = await ctx.time.now();

    // Slot should have advanced
    assert.isAbove(after.slot, before.slot);
    console.log(`  ✅ Time warped: slot ${before.slot} → ${after.slot}`);
  });
});
