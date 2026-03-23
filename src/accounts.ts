/**
 * AccountBuilder — Construct and inject custom accounts for testing.
 * Built by LixerDev / SolTestKit
 *
 * Lets you create accounts with arbitrary data layouts for testing
 * edge cases that require specific account states.
 */

import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  sendAndConfirmTransaction, LAMPORTS_PER_SOL,
} from "@solana/web3.js";

export interface RawAccountSpec {
  /** Account data as Buffer */
  data: Buffer;
  /** Program owner (defaults to SystemProgram) */
  owner?: PublicKey;
  /** Whether account is executable */
  executable?: boolean;
  /** Lamports (defaults to rent-exempt minimum) */
  lamports?: number;
}

/**
 * AccountBuilder creates raw accounts with arbitrary data for testing.
 *
 * Useful for:
 * - Injecting mock oracle account data
 * - Creating accounts in specific states (half-initialized, etc.)
 * - Testing account validation constraints
 *
 * @example
 *   const account = await ctx.accounts.createRaw({
 *     data: Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]),
 *     owner: programId,
 *   });
 */
export class AccountBuilder {
  constructor(
    private readonly connection: Connection,
    private readonly payer: Keypair,
  ) {}

  /**
   * Create a raw account with specified data and owner.
   */
  async createRaw(spec: RawAccountSpec): Promise<PublicKey> {
    const keypair = Keypair.generate();
    const lamports = spec.lamports
      ?? await this.connection.getMinimumBalanceForRentExemption(spec.data.length);

    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: this.payer.publicKey,
        newAccountPubkey: keypair.publicKey,
        lamports,
        space: spec.data.length,
        programId: spec.owner ?? SystemProgram.programId,
      }),
    );

    await sendAndConfirmTransaction(this.connection, tx, [this.payer, keypair], { commitment: "confirmed" });
    return keypair.publicKey;
  }

  /**
   * Create a zeroed account of specified size (useful for testing account init).
   */
  async createZeroed(size: number, owner?: PublicKey): Promise<PublicKey> {
    return this.createRaw({ data: Buffer.alloc(size, 0), owner });
  }

  /**
   * Read the raw data of an account.
   */
  async readData(address: PublicKey): Promise<Buffer | null> {
    const info = await this.connection.getAccountInfo(address, "confirmed");
    return info ? Buffer.from(info.data) : null;
  }

  /**
   * Get the discriminator for an Anchor account type name.
   * Useful for verifying account types in tests.
   *
   * @example
   *   const disc = AccountBuilder.discriminator("StakingPool");
   *   // disc matches the first 8 bytes of any StakingPool account
   */
  static discriminator(accountName: string): Buffer {
    const { createHash } = require("crypto");
    const hash = createHash("sha256")
      .update(`account:${accountName}`)
      .digest();
    return Buffer.from(hash.slice(0, 8));
  }

  /**
   * Build an 8-byte Anchor discriminator prefix for serializing mock data.
   *
   * @example
   *   const data = Buffer.concat([
   *     AccountBuilder.discriminator("StakingPool"),
   *     Buffer.from(poolData),
   *   ]);
   */
  static withDiscriminator(accountName: string, data: Buffer): Buffer {
    return Buffer.concat([AccountBuilder.discriminator(accountName), data]);
  }

  /**
   * Read a u64 from raw account data at a given offset.
   */
  static readU64(data: Buffer, offset: number): bigint {
    return data.readBigUInt64LE(offset);
  }

  /** Read a u32 from raw account data. */
  static readU32(data: Buffer, offset: number): number {
    return data.readUInt32LE(offset);
  }

  /** Read a bool from raw account data. */
  static readBool(data: Buffer, offset: number): boolean {
    return data[offset] === 1;
  }

  /** Read a PublicKey (32 bytes) from raw account data. */
  static readPubkey(data: Buffer, offset: number): PublicKey {
    return new PublicKey(data.slice(offset, offset + 32));
  }

  /** Read an i64 from raw account data. */
  static readI64(data: Buffer, offset: number): bigint {
    return data.readBigInt64LE(offset);
  }
}
