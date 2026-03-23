/**
 * CpiMock — Record and assert Cross-Program Invocations in Anchor tests.
 * Built by LixerDev / SolTestKit
 *
 * Since Solana programs log CPI calls in transaction logs, CpiMock
 * parses transaction logs to verify that expected programs were invoked.
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

export interface CpiRecord {
  programId: string;
  depth: number;
  instructionName?: string;
}

/**
 * CpiMock — parse transaction logs to verify CPI calls.
 *
 * @example
 *   const sig = await program.methods.stake(amount).rpc();
 *   const cpis = await ctx.cpi.parseLogs(sig);
 *   ctx.cpi.assertWasCalled(cpis, TOKEN_PROGRAM_ID);
 */
export class CpiMock {
  constructor(
    private readonly connection: Connection,
    private readonly payer: Keypair,
  ) {}

  /**
   * Parse transaction logs to extract CPI invocations.
   *
   * @param sig Transaction signature
   * @returns Array of CPI records (program invocations in call order)
   */
  async parseLogs(sig: string): Promise<CpiRecord[]> {
    const tx = await this.connection.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx?.meta?.logMessages) return [];
    return this._parseLogMessages(tx.meta.logMessages);
  }

  /**
   * Assert that a specific program was invoked at least once.
   *
   * @example
   *   ctx.cpi.assertWasCalled(records, TOKEN_PROGRAM_ID);
   */
  assertWasCalled(records: CpiRecord[], programId: PublicKey | string, msg?: string): void {
    const key = programId instanceof PublicKey ? programId.toBase58() : programId;
    const found = records.some(r => r.programId === key);
    assert.isTrue(found, msg ?? `Expected CPI to ${key.slice(0, 12)}... was not found in logs`);
  }

  /**
   * Assert that a specific program was NOT invoked.
   */
  assertNotCalled(records: CpiRecord[], programId: PublicKey | string, msg?: string): void {
    const key = programId instanceof PublicKey ? programId.toBase58() : programId;
    const found = records.some(r => r.programId === key);
    assert.isFalse(found, msg ?? `Expected no CPI to ${key.slice(0, 12)}..., but found one`);
  }

  /**
   * Assert that a program was invoked exactly `count` times.
   */
  assertCallCount(records: CpiRecord[], programId: PublicKey | string, count: number): void {
    const key = programId instanceof PublicKey ? programId.toBase58() : programId;
    const actual = records.filter(r => r.programId === key).length;
    assert.strictEqual(actual, count, `Expected ${count} CPI(s) to ${key.slice(0, 12)}..., got ${actual}`);
  }

  /**
   * Assert total number of CPI invocations.
   */
  assertTotalCpis(records: CpiRecord[], expected: number): void {
    assert.strictEqual(records.length, expected, `Expected ${expected} total CPIs, got ${records.length}`);
  }

  /**
   * Print CPI call tree to console for debugging.
   */
  printCallTree(records: CpiRecord[]): void {
    console.log("\n[SolTestKit] CPI Call Tree:");
    for (const rec of records) {
      const indent = "  ".repeat(rec.depth);
      console.log(`${indent}→ ${rec.programId.slice(0, 12)}...`);
    }
    console.log();
  }

  /**
   * Get logs that contain a specific substring.
   */
  async getMatchingLogs(sig: string, pattern: string): Promise<string[]> {
    const tx = await this.connection.getTransaction(sig, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    return (tx?.meta?.logMessages ?? []).filter(log => log.includes(pattern));
  }

  /**
   * Assert that a log line contains `text`.
   */
  async assertLogContains(sig: string, text: string): Promise<void> {
    const matching = await this.getMatchingLogs(sig, text);
    assert.isAbove(matching.length, 0, `Expected log to contain "${text}"`);
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private _parseLogMessages(logs: string[]): CpiRecord[] {
    const records: CpiRecord[] = [];
    let depth = 0;

    for (const log of logs) {
      // "Program <id> invoke [<depth>]"
      const invokeMatch = log.match(/^Program (\w+) invoke \[(\d+)\]/);
      if (invokeMatch) {
        records.push({
          programId: invokeMatch[1],
          depth: parseInt(invokeMatch[2]) - 1,
        });
        continue;
      }
      // "Program <id> success" or "Program <id> failed"
      // Just track depth
    }

    return records;
  }
}
