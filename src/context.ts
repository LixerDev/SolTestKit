/**
 * TestContext — Central test environment for SolTestKit.
 * 
 * Wraps AnchorProvider and exposes all SolTestKit utilities
 * as a single coherent interface.
 * 
 * Built by LixerDev
 */

import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { WalletFactory } from "./wallets";
import { TokenFactory } from "./tokens";
import { OracleFactory } from "./oracles";
import { CpiMock } from "./cpi";
import { TimeTravel } from "./time";
import { SolAssert } from "./assertions";
import { AccountBuilder } from "./accounts";

export interface TestContextOptions {
  /** Cluster to connect to (default: localnet) */
  cluster?: "localnet" | "devnet" | "mainnet-beta";
  /** RPC URL override */
  rpcUrl?: string;
  /** Commitment level */
  commitment?: anchor.web3.Commitment;
  /** Whether to log RPC calls */
  verbose?: boolean;
}

const CLUSTER_URLS: Record<string, string> = {
  localnet: "http://127.0.0.1:8899",
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

/**
 * TestContext — the single entry point for SolTestKit.
 *
 * Usage:
 *   const ctx = await TestContext.create();
 *   const [alice] = await ctx.wallets.createMany(1, { sol: 10 });
 *   const { mint } = await ctx.tokens.createMint({ decimals: 9 });
 */
export class TestContext {
  readonly provider: anchor.AnchorProvider;
  readonly connection: Connection;
  readonly payer: Keypair;

  readonly wallets: WalletFactory;
  readonly tokens: TokenFactory;
  readonly oracles: OracleFactory;
  readonly cpi: CpiMock;
  readonly time: TimeTravel;
  readonly assert: SolAssert;
  readonly accounts: AccountBuilder;

  private constructor(
    provider: anchor.AnchorProvider,
    payer: Keypair,
  ) {
    this.provider = provider;
    this.connection = provider.connection;
    this.payer = payer;

    this.wallets  = new WalletFactory(this.connection, payer);
    this.tokens   = new TokenFactory(this.connection, payer);
    this.oracles  = new OracleFactory(this.connection, payer);
    this.cpi      = new CpiMock(this.connection, payer);
    this.time     = new TimeTravel(this.connection);
    this.assert   = new SolAssert(this.connection);
    this.accounts = new AccountBuilder(this.connection, payer);
  }

  /**
   * Create a TestContext connected to the local validator.
   * Automatically uses ANCHOR_WALLET env var or generates a payer keypair.
   */
  static async create(options: TestContextOptions = {}): Promise<TestContext> {
    const cluster = options.cluster ?? "localnet";
    const rpcUrl = options.rpcUrl ?? CLUSTER_URLS[cluster];
    const commitment = options.commitment ?? "confirmed";

    const connection = new Connection(rpcUrl, commitment);
    const payer = Keypair.generate();

    // Fund payer from airdrop (localnet/devnet only)
    if (cluster !== "mainnet-beta") {
      try {
        const sig = await connection.requestAirdrop(payer.publicKey, 100 * anchor.web3.LAMPORTS_PER_SOL);
        await connection.confirmTransaction(sig, commitment);
      } catch {
        // Ignore airdrop failures (may already be funded or mainnet)
      }
    }

    const wallet = new anchor.Wallet(payer);
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment });
    anchor.setProvider(provider);

    return new TestContext(provider, payer);
  }

  /**
   * Create a TestContext from an existing AnchorProvider.
   * Use this when Anchor is already configured in your test environment.
   */
  static fromProvider(provider: anchor.AnchorProvider): TestContext {
    const payer = (provider.wallet as anchor.Wallet).payer;
    return new TestContext(provider, payer);
  }

  /** Get the current SOL balance of an address. */
  async getBalance(address: PublicKey): Promise<bigint> {
    const lamports = await this.connection.getBalance(address);
    return BigInt(lamports);
  }

  /** Get the current slot. */
  async currentSlot(): Promise<number> {
    return await this.connection.getSlot();
  }

  /** Get the current unix timestamp from the cluster clock. */
  async currentTimestamp(): Promise<number> {
    const slot = await this.connection.getSlot();
    const time = await this.connection.getBlockTime(slot);
    return time ?? Math.floor(Date.now() / 1000);
  }

  /** Confirm a transaction and return its logs. */
  async confirm(sig: string): Promise<string[]> {
    const result = await this.connection.confirmTransaction(sig, "confirmed");
    if (result.value.err) throw new Error(`Transaction failed: ${JSON.stringify(result.value.err)}`);
    const tx = await this.connection.getTransaction(sig, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
    return tx?.meta?.logMessages ?? [];
  }
}
