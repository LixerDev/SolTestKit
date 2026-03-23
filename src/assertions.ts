/**
 * SolAssert — Custom assertion helpers for Anchor tests.
 * Built by LixerDev / SolTestKit
 *
 * Provides Chai-compatible assertions for:
 * - Token balances (before/after deltas)
 * - SOL lamport changes
 * - Account state (exists, closed, owner, discriminator)
 * - Instruction success/failure with error matching
 * - Anchor event emission
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { getAccount, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import * as anchor from "@coral-xyz/anchor";

export class AssertionError extends Error {
  constructor(message: string) {
    super(`[SolTestKit] ${message}`);
  }
}

/**
 * SolAssert — assertion library tuned for Solana/Anchor testing.
 *
 * @example
 *   await ctx.assert.tokenBalanceEquals(ata, 1_000_000n);
 *   await ctx.assert.accountExists(poolPDA);
 *   await ctx.assert.instructionFails(() => program.methods.stake(new BN(-1)).rpc(), "ZeroAmount");
 */
export class SolAssert {
  constructor(private readonly connection: Connection) {}

  // ─── Token Balance Assertions ─────────────────────────────────────────────

  /**
   * Assert that an ATA has exactly `expected` raw token units.
   */
  async tokenBalanceEquals(ata: PublicKey, expected: bigint, msg?: string): Promise<void> {
    const balance = await this._getTokenBalance(ata);
    assert.strictEqual(
      balance,
      expected,
      msg ?? `Expected token balance ${expected}, got ${balance}`,
    );
  }

  /**
   * Snapshot a balance, run `fn`, then assert it decreased by `amount`.
   *
   * @example
   *   await ctx.assert.tokenBalanceDecreased(aliceATA, 100_000_000n, async () => {
   *     await program.methods.stake(new BN(100_000_000)).rpc();
   *   });
   */
  async tokenBalanceDecreased(
    ata: PublicKey,
    expectedDecrease: bigint,
    fn?: () => Promise<void>,
  ): Promise<void> {
    const before = await this._getTokenBalance(ata);
    if (fn) await fn();
    const after = await this._getTokenBalance(ata);
    const actual = before - after;
    assert.strictEqual(
      actual,
      expectedDecrease,
      `Expected token balance to decrease by ${expectedDecrease}, actual decrease: ${actual}`,
    );
  }

  /**
   * Snapshot a balance, run `fn`, then assert it increased by `amount`.
   */
  async tokenBalanceIncreased(
    ata: PublicKey,
    expectedIncrease: bigint,
    fn?: () => Promise<void>,
  ): Promise<void> {
    const before = await this._getTokenBalance(ata);
    if (fn) await fn();
    const after = await this._getTokenBalance(ata);
    const actual = after - before;
    assert.strictEqual(
      actual,
      expectedIncrease,
      `Expected token balance to increase by ${expectedIncrease}, actual increase: ${actual}`,
    );
  }

  /**
   * Assert that an ATA balance changed by `delta` (positive = increase, negative = decrease).
   */
  async tokenBalanceChanged(
    ata: PublicKey,
    delta: bigint,
    fn?: () => Promise<void>,
  ): Promise<void> {
    const before = await this._getTokenBalance(ata);
    if (fn) await fn();
    const after = await this._getTokenBalance(ata);
    const actual = after - before;
    assert.strictEqual(
      actual,
      delta,
      `Expected token balance to change by ${delta}, actual change: ${actual}`,
    );
  }

  /** Assert an ATA balance is greater than `min`. */
  async tokenBalanceAbove(ata: PublicKey, min: bigint): Promise<void> {
    const balance = await this._getTokenBalance(ata);
    assert.isTrue(balance > min, `Expected token balance > ${min}, got ${balance}`);
  }

  /** Assert an ATA balance is zero. */
  async tokenBalanceZero(ata: PublicKey): Promise<void> {
    return this.tokenBalanceEquals(ata, 0n, "Expected token balance to be zero");
  }

  // ─── SOL / Lamport Assertions ─────────────────────────────────────────────

  /**
   * Assert an address received at least `lamports` since `fn` ran.
   */
  async lamportsIncreased(
    address: PublicKey,
    expectedIncrease: bigint,
    fn?: () => Promise<void>,
  ): Promise<void> {
    const before = BigInt(await this.connection.getBalance(address, "confirmed"));
    if (fn) await fn();
    const after = BigInt(await this.connection.getBalance(address, "confirmed"));
    assert.isTrue(
      after - before >= expectedIncrease,
      `Expected lamports to increase by at least ${expectedIncrease}, got ${after - before}`,
    );
  }

  /**
   * Assert an address paid at least `lamports` since `fn` ran.
   */
  async lamportsDecreased(
    address: PublicKey,
    expectedDecrease: bigint,
    fn?: () => Promise<void>,
  ): Promise<void> {
    const before = BigInt(await this.connection.getBalance(address, "confirmed"));
    if (fn) await fn();
    const after = BigInt(await this.connection.getBalance(address, "confirmed"));
    assert.isTrue(
      before - after >= expectedDecrease,
      `Expected lamports to decrease by at least ${expectedDecrease}, got ${before - after}`,
    );
  }

  /** Assert an address has at least `lamports` SOL. */
  async hasMinimumBalance(address: PublicKey, lamports: bigint): Promise<void> {
    const balance = BigInt(await this.connection.getBalance(address, "confirmed"));
    assert.isTrue(balance >= lamports, `Expected balance >= ${lamports}, got ${balance}`);
  }

  // ─── Account State Assertions ─────────────────────────────────────────────

  /** Assert an account exists (has non-zero data). */
  async accountExists(address: PublicKey, msg?: string): Promise<void> {
    const info = await this.connection.getAccountInfo(address, "confirmed");
    assert.isNotNull(info, msg ?? `Expected account ${address.toBase58()} to exist`);
  }

  /** Assert an account does NOT exist (closed). */
  async accountClosed(address: PublicKey, msg?: string): Promise<void> {
    const info = await this.connection.getAccountInfo(address, "confirmed");
    assert.isNull(info, msg ?? `Expected account ${address.toBase58()} to be closed`);
  }

  /** Assert the program owner of an account. */
  async accountOwner(address: PublicKey, expectedOwner: PublicKey): Promise<void> {
    const info = await this.connection.getAccountInfo(address, "confirmed");
    assert.isNotNull(info, `Account ${address.toBase58()} does not exist`);
    assert.strictEqual(
      info!.owner.toBase58(),
      expectedOwner.toBase58(),
      `Expected account owner ${expectedOwner.toBase58()}, got ${info!.owner.toBase58()}`,
    );
  }

  /**
   * Assert an account's 8-byte Anchor discriminator matches the given name.
   * Useful for verifying account type without decoding.
   */
  async hasAnchorDiscriminator(address: PublicKey, accountName: string): Promise<void> {
    const { BorshCoder } = await import("@coral-xyz/anchor");
    const info = await this.connection.getAccountInfo(address, "confirmed");
    assert.isNotNull(info);
    const discriminator = info!.data.slice(0, 8);
    const expected = anchor.utils.sha256.hash(`account:${accountName}`).slice(0, 8);
    assert.deepEqual(
      Array.from(discriminator),
      Array.from(expected),
      `Discriminator mismatch for account ${accountName}`,
    );
  }

  // ─── Instruction Assertions ───────────────────────────────────────────────

  /**
   * Assert that an instruction fails with a specific Anchor error name.
   *
   * @example
   *   await ctx.assert.instructionFails(
   *     () => program.methods.unstake(new BN(99999)).rpc(),
   *     "InsufficientStake",
   *   );
   */
  async instructionFails(
    fn: () => Promise<unknown>,
    expectedError?: string,
  ): Promise<void> {
    try {
      await fn();
      throw new AssertionError(`Expected instruction to fail${expectedError ? ` with ${expectedError}` : ""}, but it succeeded`);
    } catch (e: any) {
      if (e instanceof AssertionError) throw e;
      if (expectedError) {
        const msg = e?.message ?? e?.toString() ?? "";
        const logs = e?.logs?.join("\n") ?? "";
        assert.isTrue(
          msg.includes(expectedError) || logs.includes(expectedError),
          `Expected error containing "${expectedError}", got:\n${msg}\n${logs}`,
        );
      }
      // If no expectedError, any failure is acceptable
    }
  }

  /**
   * Assert that an instruction succeeds and return its signature.
   */
  async instructionSucceeds(fn: () => Promise<string>): Promise<string> {
    try {
      const sig = await fn();
      assert.isString(sig, "Expected a transaction signature");
      return sig;
    } catch (e: any) {
      const logs = e?.logs?.join("\n") ?? "";
      throw new AssertionError(`Expected instruction to succeed, but it failed:\n${e?.message}\n${logs}`);
    }
  }

  /**
   * Assert that a program emitted a specific Anchor event.
   *
   * @example
   *   await ctx.assert.eventEmitted(program, "StakeEvent", { user: alice.publicKey });
   */
  async eventEmitted(
    program: anchor.Program,
    eventName: string,
    expectedFields: Record<string, unknown> = {},
    fn?: () => Promise<string>,
  ): Promise<void> {
    return new Promise(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        listener.resolve(); // cleanup
        reject(new AssertionError(`Timeout waiting for event ${eventName}`));
      }, 10_000);

      const listener = program.addEventListener(eventName, (event) => {
        try {
          for (const [key, value] of Object.entries(expectedFields)) {
            const actual = (event as any)[key];
            if (actual instanceof PublicKey) {
              assert.strictEqual(actual.toBase58(), (value as PublicKey).toBase58(), `Event field ${key} mismatch`);
            } else {
              assert.deepEqual(actual, value, `Event field ${key} mismatch`);
            }
          }
          clearTimeout(timeout);
          program.removeEventListener(listener);
          resolve();
        } catch (e) {
          clearTimeout(timeout);
          reject(e);
        }
      });

      if (fn) {
        try { await fn(); } catch (e) { clearTimeout(timeout); reject(e); }
      }
    });
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async _getTokenBalance(ata: PublicKey): Promise<bigint> {
    try {
      const account = await getAccount(this.connection, ata);
      return account.amount;
    } catch {
      return 0n;
    }
  }
}
