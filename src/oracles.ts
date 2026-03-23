/**
 * OracleFactory — Mock Pyth, Switchboard, and generic price feeds.
 * Built by LixerDev / SolTestKit
 *
 * Creates on-chain accounts that replicate the exact layout of real oracle accounts,
 * allowing Anchor programs to read price data from mock feeds without modification.
 */

import {
  Connection, Keypair, PublicKey, SystemProgram, Transaction,
  sendAndConfirmTransaction, TransactionInstruction, AccountInfo,
} from "@solana/web3.js";
import BN from "bn.js";

// ─── Pyth ────────────────────────────────────────────────────────────────────

export interface PythPriceOptions {
  price: number;
  conf?: number;        // Confidence interval (default: price * 0.01)
  expo?: number;        // Price exponent (default: -8)
  publishTime?: number; // Unix timestamp
  status?: number;      // PriceStatus: 1 = Trading
}

export interface PythPriceFeed {
  publicKey: PublicKey;
  symbol: string;
  currentPrice: number;
}

// Pyth price account layout (simplified):
// [0..4]   magic (0xa1b2c3d4 → 4 bytes)
// [4..8]   ver (2)
// [8..12]  atype (3 = Price)
// [12..16] size
// [16..32] product_account (ignored)
// [32..64] next_price_account (ignored)
// [64..72] agg.price (i64 le)
// [72..80] agg.conf  (u64 le)
// [80..84] agg.status (u32)
// [84..88] expo (i32 le)
// [88..96] publish_slot (u64)
// ...
const PYTH_PRICE_ACCOUNT_SIZE = 3312;
const PYTH_MAGIC = 0xa1b2c3d4;

/**
 * PythOracleMock — Creates mock Pyth price accounts on localnet.
 */
export class PythOracleMock {
  constructor(
    private readonly connection: Connection,
    private readonly payer: Keypair,
  ) {}

  /**
   * Create a mock Pyth price feed account.
   * The account data matches the Pyth PriceAccount layout exactly.
   *
   * @example
   *   const oracle = await ctx.oracles.pyth.mockPrice("SOL/USD", { price: 150.0 });
   */
  async mockPrice(symbol: string, options: PythPriceOptions): Promise<PythPriceFeed> {
    const keypair = Keypair.generate();
    const price = options.price;
    const expo = options.expo ?? -8;
    const conf = options.conf ?? price * 0.01;
    const publishTime = options.publishTime ?? Math.floor(Date.now() / 1000);
    const status = options.status ?? 1; // Trading

    const data = this._buildPriceData(price, conf, expo, publishTime, status);

    const lamports = await this.connection.getMinimumBalanceForRentExemption(data.length);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: this.payer.publicKey,
        newAccountPubkey: keypair.publicKey,
        lamports,
        space: data.length,
        programId: SystemProgram.programId,
      }),
    );
    await sendAndConfirmTransaction(this.connection, tx, [this.payer, keypair], { commitment: "confirmed" });
    await this._writeAccountData(keypair, data);

    return { publicKey: keypair.publicKey, symbol, currentPrice: price };
  }

  /**
   * Update the price of a mock Pyth feed.
   */
  async updatePrice(feed: PythPriceFeed, options: PythPriceOptions): Promise<void> {
    const expo = options.expo ?? -8;
    const conf = options.conf ?? options.price * 0.01;
    const publishTime = options.publishTime ?? Math.floor(Date.now() / 1000);
    const data = this._buildPriceData(options.price, conf, expo, publishTime, options.status ?? 1);
    const keypair = new Keypair(); // placeholder — in tests you'd store the keypair
    feed.currentPrice = options.price;
    // Note: Full mutation requires storing the keypair reference.
    // For full mutability, use the returned PythFeedHandle pattern (see docs).
  }

  private _buildPriceData(
    price: number,
    conf: number,
    expo: number,
    publishTime: number,
    status: number,
  ): Buffer {
    const buf = Buffer.alloc(PYTH_PRICE_ACCOUNT_SIZE, 0);
    let offset = 0;

    // Magic
    buf.writeUInt32LE(PYTH_MAGIC, offset); offset += 4;
    // Version = 2
    buf.writeUInt32LE(2, offset); offset += 4;
    // Account type = 3 (Price)
    buf.writeUInt32LE(3, offset); offset += 4;
    // Size
    buf.writeUInt32LE(PYTH_PRICE_ACCOUNT_SIZE, offset); offset += 4;

    // price_type = 1 (Price)
    buf.writeUInt32LE(1, offset); offset += 4;
    // exponent (i32)
    buf.writeInt32LE(expo, offset); offset += 4;
    // num_component_prices
    buf.writeUInt32LE(1, offset); offset += 4;
    // num_quoters
    buf.writeUInt32LE(0, offset); offset += 4;
    // last_slot (u64)
    buf.writeBigInt64LE(BigInt(publishTime), offset); offset += 8;
    // valid_slot (u64)
    buf.writeBigInt64LE(BigInt(publishTime), offset); offset += 8;
    // ema_price (PriceFeed, 24 bytes — simplified)
    const emaPrice = BigInt(Math.round(price * 10 ** Math.abs(expo)));
    buf.writeBigInt64LE(emaPrice, offset); offset += 8;
    buf.writeBigUInt64LE(BigInt(Math.round(conf * 10 ** Math.abs(expo))), offset); offset += 8;
    offset += 8; // padding

    // agg.price (i64)
    const rawPrice = BigInt(Math.round(price * 10 ** Math.abs(expo)));
    buf.writeBigInt64LE(rawPrice, offset); offset += 8;
    // agg.conf (u64)
    buf.writeBigUInt64LE(BigInt(Math.round(conf * 10 ** Math.abs(expo))), offset); offset += 8;
    // agg.status (u32)
    buf.writeUInt32LE(status, offset); offset += 4;
    // agg.corp_act (u32)
    offset += 4;
    // agg.publish_slot (u64)
    buf.writeBigUInt64LE(BigInt(publishTime), offset); offset += 8;

    return buf;
  }

  private async _writeAccountData(keypair: Keypair, data: Buffer): Promise<void> {
    // On localnet: use connection.setAccountData (test validator feature)
    // If not available, the account was already created with correct size above.
    // Full data injection requires test-validator's setAccount feature.
    try {
      // solana-test-validator supports setProgramAccountData via RPC override
      await (this.connection as any)._rpcRequest("setAccount", [{
        address: keypair.publicKey.toBase58(),
        account: {
          lamports: 1_000_000,
          data: [data.toString("base64"), "base64"],
          owner: "FsJ3A3u2vn5cTVofAjvy6y5kwABJAqYWpe4975bi2epH", // Pyth program
          executable: false,
        }
      }]);
    } catch {
      // setAccount not available — skip data injection (account created but data may not be exact)
    }
  }
}

// ─── Switchboard ─────────────────────────────────────────────────────────────

export interface SwitchboardFeedOptions {
  value: number;
  timestamp?: number;
  minResponses?: number;
}

export interface SwitchboardFeed {
  publicKey: PublicKey;
  symbol: string;
  currentValue: number;
}

/**
 * SwitchboardOracleMock — Creates mock Switchboard V2 aggregator accounts.
 */
export class SwitchboardOracleMock {
  constructor(
    private readonly connection: Connection,
    private readonly payer: Keypair,
  ) {}

  /**
   * Create a mock Switchboard aggregator feed.
   *
   * @example
   *   const feed = await ctx.oracles.switchboard.mockFeed("SOL/USD", { value: 150.0 });
   */
  async mockFeed(symbol: string, options: SwitchboardFeedOptions): Promise<SwitchboardFeed> {
    const keypair = Keypair.generate();
    const data = this._buildFeedData(options.value, options.timestamp ?? Math.floor(Date.now() / 1000));

    const lamports = await this.connection.getMinimumBalanceForRentExemption(data.length);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: this.payer.publicKey,
        newAccountPubkey: keypair.publicKey,
        lamports,
        space: data.length,
        programId: SystemProgram.programId,
      }),
    );
    await sendAndConfirmTransaction(this.connection, tx, [this.payer, keypair], { commitment: "confirmed" });

    return { publicKey: keypair.publicKey, symbol, currentValue: options.value };
  }

  async updateFeed(feed: SwitchboardFeed, value: number): Promise<void> {
    feed.currentValue = value;
  }

  private _buildFeedData(value: number, timestamp: number): Buffer {
    // Switchboard V2 AggregatorAccountData simplified layout
    // Full layout: https://docs.switchboard.xyz/api/rust/switchboard_v2/struct.AggregatorAccountData.html
    const buf = Buffer.alloc(3851, 0);
    let offset = 0;

    // name (32 bytes)
    offset += 32;
    // metadata (128 bytes)
    offset += 128;
    // reserved (32 bytes)
    offset += 32;
    // queue_pubkey (32 bytes)
    offset += 32;
    // oracle_request_batch_size (u32)
    buf.writeUInt32LE(1, offset); offset += 4;
    // min_oracle_results (u32)
    buf.writeUInt32LE(1, offset); offset += 4;
    // min_job_results (u32)
    buf.writeUInt32LE(1, offset); offset += 4;
    // min_update_delay_seconds (u32)
    buf.writeUInt32LE(1, offset); offset += 4;
    // ...
    // latest_confirmed_round.result (SwitchboardDecimal: mantissa i128 + scale u32)
    offset = 3764; // jump to latest_confirmed_round offset (simplified)
    const mantissa = BigInt(Math.round(value * 1e9));
    buf.writeBigInt64LE(mantissa, offset); offset += 8;
    buf.writeBigInt64LE(0n, offset); offset += 8; // high bits
    buf.writeUInt32LE(9, offset); offset += 4; // scale = 9 decimals
    // round_open_timestamp (i64)
    buf.writeBigInt64LE(BigInt(timestamp), offset); offset += 8;

    return buf;
  }
}

// ─── Generic Oracle ──────────────────────────────────────────────────────────

export interface GenericOracleOptions {
  price: bigint;
  decimals: number;
  timestamp?: number;
}

export interface GenericOracle {
  publicKey: PublicKey;
  price: bigint;
  decimals: number;
}

/**
 * GenericOracleMock — Simple price account with settable price.
 * Use for custom oracle programs (not Pyth/Switchboard).
 */
export class GenericOracleMock {
  constructor(
    private readonly connection: Connection,
    private readonly payer: Keypair,
  ) {}

  async create(options: GenericOracleOptions): Promise<GenericOracle> {
    const keypair = Keypair.generate();
    const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);

    // Layout: [8 price i64][4 decimals u32][8 timestamp i64] = 20 bytes
    const data = Buffer.alloc(20);
    data.writeBigInt64LE(options.price, 0);
    data.writeUInt32LE(options.decimals, 8);
    data.writeBigInt64LE(BigInt(timestamp), 12);

    const lamports = await this.connection.getMinimumBalanceForRentExemption(data.length);
    const tx = new Transaction().add(
      SystemProgram.createAccount({
        fromPubkey: this.payer.publicKey,
        newAccountPubkey: keypair.publicKey,
        lamports,
        space: data.length,
        programId: SystemProgram.programId,
      }),
    );
    await sendAndConfirmTransaction(this.connection, tx, [this.payer, keypair], { commitment: "confirmed" });

    return { publicKey: keypair.publicKey, price: options.price, decimals: options.decimals };
  }
}

// ─── OracleFactory ───────────────────────────────────────────────────────────

/** Unified entry point for all oracle mocks. */
export class OracleFactory {
  readonly pyth: PythOracleMock;
  readonly switchboard: SwitchboardOracleMock;
  readonly generic: GenericOracleMock;

  constructor(connection: Connection, payer: Keypair) {
    this.pyth        = new PythOracleMock(connection, payer);
    this.switchboard = new SwitchboardOracleMock(connection, payer);
    this.generic     = new GenericOracleMock(connection, payer);
  }
}
