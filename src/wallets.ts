/**
 * WalletFactory — Create and fund test wallets.
 * Built by LixerDev / SolTestKit
 */

import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";

export interface WalletOptions {
  /** Initial SOL balance */
  sol?: number;
  /** Initial lamports (overrides `sol`) */
  lamports?: number;
}

export interface TestWallet {
  keypair: Keypair;
  publicKey: PublicKey;
  secretKey: Uint8Array;
}

/**
 * WalletFactory creates pre-funded Keypairs for use in Anchor tests.
 *
 * All created wallets are funded from the payer (airdrop or transfer).
 */
export class WalletFactory {
  private _named: Map<string, TestWallet> = new Map();
  private _all: TestWallet[] = [];

  constructor(
    private readonly connection: Connection,
    private readonly payer: Keypair,
  ) {}

  /**
   * Create a single funded test wallet.
   *
   * @example
   *   const alice = await ctx.wallets.create({ sol: 5 });
   *   console.log(alice.publicKey.toBase58());
   */
  async create(options: WalletOptions = {}): Promise<TestWallet> {
    const keypair = Keypair.generate();
    const lamports = options.lamports ?? Math.floor((options.sol ?? 1) * LAMPORTS_PER_SOL);

    await this._fund(keypair.publicKey, lamports);

    const wallet: TestWallet = {
      keypair,
      publicKey: keypair.publicKey,
      secretKey: keypair.secretKey,
    };
    this._all.push(wallet);
    return wallet;
  }

  /**
   * Create multiple funded wallets at once.
   *
   * @example
   *   const [alice, bob, charlie] = await ctx.wallets.createMany(3, { sol: 10 });
   */
  async createMany(count: number, options: WalletOptions = {}): Promise<TestWallet[]> {
    return Promise.all(Array.from({ length: count }, () => this.create(options)));
  }

  /**
   * Create a named wallet (accessible later via `ctx.wallets.get("name")`).
   *
   * @example
   *   const admin = await ctx.wallets.named("admin", { sol: 100 });
   *   const admin2 = ctx.wallets.get("admin"); // same wallet
   */
  async named(name: string, options: WalletOptions = {}): Promise<TestWallet> {
    if (this._named.has(name)) return this._named.get(name)!;
    const wallet = await this.create(options);
    this._named.set(name, wallet);
    return wallet;
  }

  /** Get a previously named wallet. */
  get(name: string): TestWallet | undefined {
    return this._named.get(name);
  }

  /** Get all created wallets. */
  all(): TestWallet[] {
    return [...this._all];
  }

  /**
   * Get the SOL balance of any public key.
   */
  async getBalance(address: PublicKey | TestWallet): Promise<number> {
    const key = address instanceof PublicKey ? address : address.publicKey;
    const lamports = await this.connection.getBalance(key);
    return lamports / LAMPORTS_PER_SOL;
  }

  /**
   * Transfer SOL from payer to a wallet.
   */
  async fund(target: PublicKey | TestWallet, sol: number): Promise<string> {
    const key = target instanceof PublicKey ? target : target.publicKey;
    const lamports = Math.floor(sol * LAMPORTS_PER_SOL);
    return await this._fund(key, lamports);
  }

  /**
   * Transfer SOL between wallets.
   */
  async transfer(from: TestWallet, to: PublicKey | TestWallet, sol: number): Promise<string> {
    const toKey = to instanceof PublicKey ? to : to.publicKey;
    const lamports = Math.floor(sol * LAMPORTS_PER_SOL);
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: toKey, lamports }),
    );
    return await sendAndConfirmTransaction(this.connection, tx, [from.keypair], { commitment: "confirmed" });
  }

  private async _fund(target: PublicKey, lamports: number): Promise<string> {
    // Try airdrop first (localnet/devnet)
    try {
      const sig = await this.connection.requestAirdrop(target, lamports);
      await this.connection.confirmTransaction(sig, "confirmed");
      return sig;
    } catch {
      // Fall back to transfer from payer
    }

    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: this.payer.publicKey, toPubkey: target, lamports }),
    );
    return await sendAndConfirmTransaction(this.connection, tx, [this.payer], { commitment: "confirmed" });
  }
}
