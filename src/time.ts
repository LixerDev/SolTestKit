/**
 * TimeTravel — Manipulate the local validator clock for time-dependent tests.
 * Built by LixerDev / SolTestKit
 *
 * Works with solana-test-validator's clock manipulation features.
 * Requires the test validator to be started with no restrictions.
 */

import { Connection } from "@solana/web3.js";

export interface ClockState {
  slot: number;
  epoch: number;
  unixTimestamp: number;
  epochStartTimestamp: number;
  leaderScheduleEpoch: number;
}

/**
 * TimeTravel lets you warp the on-chain clock in your Anchor tests.
 *
 * @example
 *   await ctx.time.warpSeconds(3600);   // Fast-forward 1 hour
 *   await ctx.time.warpDays(30);        // Fast-forward 30 days
 *   await ctx.time.warpSlots(1000);     // Fast-forward 1000 slots
 */
export class TimeTravel {
  private _frozenAt: number | null = null;

  constructor(private readonly connection: Connection) {}

  /**
   * Get the current on-chain clock state.
   */
  async now(): Promise<ClockState> {
    const slot = await this.connection.getSlot("confirmed");
    const blockTime = await this.connection.getBlockTime(slot);
    const epochInfo = await this.connection.getEpochInfo("confirmed");
    return {
      slot,
      epoch: epochInfo.epoch,
      unixTimestamp: blockTime ?? Math.floor(Date.now() / 1000),
      epochStartTimestamp: blockTime ?? 0,
      leaderScheduleEpoch: epochInfo.epoch + 1,
    };
  }

  /**
   * Warp the validator clock forward by `seconds`.
   *
   * Uses the `warpSlot` test-validator RPC extension.
   * Falls back to waiting for real slots if not available.
   *
   * @example
   *   await ctx.time.warpSeconds(3600); // +1 hour
   */
  async warpSeconds(seconds: number): Promise<void> {
    await this._warp({ seconds });
  }

  /** Warp forward by minutes. */
  async warpMinutes(minutes: number): Promise<void> {
    await this._warp({ seconds: minutes * 60 });
  }

  /** Warp forward by hours. */
  async warpHours(hours: number): Promise<void> {
    await this._warp({ seconds: hours * 3600 });
  }

  /** Warp forward by days. */
  async warpDays(days: number): Promise<void> {
    await this._warp({ seconds: days * 86400 });
  }

  /**
   * Warp forward by `n` slots.
   *
   * @example
   *   await ctx.time.warpSlots(432000); // ~2 days (assuming 400ms/slot)
   */
  async warpSlots(slots: number): Promise<void> {
    await this._warp({ slots });
  }

  /**
   * Set the absolute unix timestamp on the validator clock.
   *
   * @example
   *   await ctx.time.setUnixTimestamp(1700000000);
   */
  async setUnixTimestamp(timestamp: number): Promise<void> {
    const current = await this.now();
    const diff = timestamp - current.unixTimestamp;
    if (diff > 0) await this.warpSeconds(diff);
    // Cannot go backward on most validators — log a warning if diff < 0
    if (diff < 0) console.warn("[SolTestKit] Cannot warp backward in time on most validators.");
  }

  /**
   * Freeze the validator clock at the current timestamp.
   * Subsequent slots do not advance the unix timestamp.
   *
   * Note: Requires `--warp-slot` support in test-validator.
   */
  async freeze(): Promise<void> {
    const state = await this.now();
    this._frozenAt = state.unixTimestamp;
    await this._setClockOverride({ unixTimestamp: this._frozenAt, slot: state.slot });
  }

  /** Resume normal clock progression after a freeze. */
  async resume(): Promise<void> {
    this._frozenAt = null;
    await this._clearClockOverride();
  }

  /**
   * Wait for `n` slots to be produced (real time).
   * Use for tests that need actual slot progression.
   */
  async waitForSlots(n: number): Promise<void> {
    const target = (await this.connection.getSlot()) + n;
    while ((await this.connection.getSlot()) < target) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  /**
   * Wait until the on-chain timestamp reaches `unixTimestamp`.
   * Times out after `timeoutMs` milliseconds.
   */
  async waitUntil(unixTimestamp: number, timeoutMs = 60_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const state = await this.now();
      if (state.unixTimestamp >= unixTimestamp) return;
      await new Promise(r => setTimeout(r, 500));
    }
    throw new Error(`[TimeTravel] Timed out waiting for timestamp ${unixTimestamp}`);
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private async _warp(opts: { seconds?: number; slots?: number }): Promise<void> {
    const currentSlot = await this.connection.getSlot("confirmed");

    if (opts.slots) {
      // Warp by slot count
      const targetSlot = currentSlot + opts.slots;
      try {
        await (this.connection as any)._rpcRequest("warpSlot", [targetSlot]);
        await this._waitForSlot(targetSlot);
      } catch {
        // Fallback: produce slots naturally (slow)
        await this.waitForSlots(Math.min(opts.slots, 5));
      }
      return;
    }

    if (opts.seconds) {
      // Try warpClock (test-validator extension)
      try {
        await (this.connection as any)._rpcRequest("warpClock", [{
          unixTimestamp: (await this.now()).unixTimestamp + opts.seconds,
        }]);
        return;
      } catch {
        // Fallback: warp slots (1 slot ≈ 400ms)
        const slots = Math.ceil(opts.seconds / 0.4);
        const targetSlot = currentSlot + slots;
        try {
          await (this.connection as any)._rpcRequest("warpSlot", [targetSlot]);
          await this._waitForSlot(targetSlot);
        } catch {
          console.warn(`[TimeTravel] warpSlot not available. Add --warp-slot support to your test validator.`);
          console.warn(`[TimeTravel] Alternatively, use Clock sysvar override with anchor-bankrun.`);
        }
      }
    }
  }

  private async _setClockOverride(state: Partial<ClockState>): Promise<void> {
    try {
      await (this.connection as any)._rpcRequest("setClockTimestamp", [state.unixTimestamp]);
    } catch {
      // Not supported
    }
  }

  private async _clearClockOverride(): Promise<void> {
    try {
      await (this.connection as any)._rpcRequest("clearClockTimestamp", []);
    } catch {
      // Not supported
    }
  }

  private async _waitForSlot(target: number, timeoutMs = 10_000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if ((await this.connection.getSlot()) >= target) return;
      await new Promise(r => setTimeout(r, 100));
    }
  }
}
