/**
 * TokenFactory — Create SPL token mints and accounts with initial balances.
 * Built by LixerDev / SolTestKit
 */

import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import {
  createMint,
  createAssociatedTokenAccount,
  mintTo,
  getAccount,
  getMint,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
} from "@solana/spl-token";

export interface CreateMintOptions {
  /** Token decimals (default: 9) */
  decimals?: number;
  /** Mint authority — defaults to payer */
  mintAuthority?: Keypair;
  /** Freeze authority — defaults to null */
  freezeAuthority?: PublicKey | null;
}

export interface MintResult {
  mint: PublicKey;
  mintAuthority: Keypair;
  decimals: number;
}

export interface HolderSpec {
  owner: PublicKey;
  amount: bigint;
}

export interface TokenScenarioOptions {
  decimals?: number;
  holders: HolderSpec[];
  mintAuthority?: Keypair;
}

export interface TokenScenarioResult {
  mint: PublicKey;
  mintAuthority: Keypair;
  decimals: number;
  accounts: Map<string, PublicKey>; // owner.toBase58() → ATA
}

/**
 * TokenFactory creates SPL token mints and funded accounts for testing.
 *
 * @example
 *   const { mint } = await ctx.tokens.createMint({ decimals: 6 });
 *   const ata = await ctx.tokens.createAndFund(mint, alice.publicKey, 1_000_000n);
 */
export class TokenFactory {
  constructor(
    private readonly connection: Connection,
    private readonly payer: Keypair,
  ) {}

  /**
   * Create a new SPL token mint.
   *
   * @example
   *   const { mint, mintAuthority } = await ctx.tokens.createMint({ decimals: 9 });
   */
  async createMint(options: CreateMintOptions = {}): Promise<MintResult> {
    const decimals = options.decimals ?? 9;
    const mintAuthority = options.mintAuthority ?? this.payer;
    const freezeAuthority = options.freezeAuthority ?? null;

    const mint = await createMint(
      this.connection,
      this.payer,
      mintAuthority.publicKey,
      freezeAuthority,
      decimals,
    );

    return { mint, mintAuthority, decimals };
  }

  /**
   * Create an associated token account for `owner` under `mint`.
   */
  async createATA(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
    return await createAssociatedTokenAccount(
      this.connection,
      this.payer,
      mint,
      owner,
    );
  }

  /**
   * Mint `amount` tokens into an existing ATA.
   *
   * @param mintAuthority Keypair that has mint authority (defaults to payer)
   */
  async mintTo(
    mint: PublicKey,
    destination: PublicKey,
    amount: bigint,
    mintAuthority: Keypair = this.payer,
  ): Promise<string> {
    return await mintTo(
      this.connection,
      this.payer,
      mint,
      destination,
      mintAuthority,
      amount,
    );
  }

  /**
   * Create an ATA and mint `amount` tokens to it in one call.
   *
   * @example
   *   const ata = await ctx.tokens.createAndFund(mint, alice.publicKey, 1_000n * 10n ** 9n);
   */
  async createAndFund(
    mint: PublicKey,
    owner: PublicKey,
    amount: bigint,
    mintAuthority: Keypair = this.payer,
  ): Promise<PublicKey> {
    const ata = await this.createATA(mint, owner);
    await this.mintTo(mint, ata, amount, mintAuthority);
    return ata;
  }

  /**
   * Get the token balance of an ATA.
   * Returns raw amount (not decimal-adjusted).
   */
  async getBalance(ata: PublicKey): Promise<bigint> {
    try {
      const account = await getAccount(this.connection, ata);
      return account.amount;
    } catch (e) {
      if (e instanceof TokenAccountNotFoundError) return 0n;
      throw e;
    }
  }

  /**
   * Get the human-readable token balance (decimal-adjusted).
   */
  async getBalanceUi(ata: PublicKey): Promise<number> {
    const mintInfo = await this._getMintForAta(ata);
    const raw = await this.getBalance(ata);
    return Number(raw) / 10 ** mintInfo.decimals;
  }

  /**
   * Derive the ATA address for `owner` + `mint` without creating it.
   */
  async getATA(mint: PublicKey, owner: PublicKey): Promise<PublicKey> {
    return await getAssociatedTokenAddress(mint, owner);
  }

  /**
   * Create a complete multi-holder token scenario in one call.
   *
   * @example
   *   const { mint, accounts } = await ctx.tokens.scenario({
   *     decimals: 9,
   *     holders: [
   *       { owner: alice.publicKey, amount: 1_000n * 10n ** 9n },
   *       { owner: bob.publicKey,   amount: 500n  * 10n ** 9n },
   *     ],
   *   });
   */
  async scenario(options: TokenScenarioOptions): Promise<TokenScenarioResult> {
    const { mint, mintAuthority, decimals } = await this.createMint({
      decimals: options.decimals,
      mintAuthority: options.mintAuthority,
    });

    const accounts = new Map<string, PublicKey>();

    for (const holder of options.holders) {
      const ata = await this.createAndFund(mint, holder.owner, holder.amount, mintAuthority);
      accounts.set(holder.owner.toBase58(), ata);
    }

    return { mint, mintAuthority, decimals, accounts };
  }

  /**
   * Burn tokens from an ATA.
   */
  async burn(
    mint: PublicKey,
    source: PublicKey,
    owner: Keypair,
    amount: bigint,
  ): Promise<string> {
    const { burnChecked } = await import("@solana/spl-token");
    const mintInfo = await getMint(this.connection, mint);
    return await burnChecked(this.connection, this.payer, source, mint, owner, amount, mintInfo.decimals);
  }

  private async _getMintForAta(ata: PublicKey) {
    const account = await getAccount(this.connection, ata);
    return await getMint(this.connection, account.mint);
  }
}
