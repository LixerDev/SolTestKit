/**
 * NFT Fixtures — Pre-built environments for NFT program testing.
 * Built by LixerDev / SolTestKit
 */

import { PublicKey, Keypair } from "@solana/web3.js";
import { createMint, createAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { TestContext } from "../context";
import { TestWallet } from "../wallets";

export interface NftSpec {
  /** NFT mint keypair */
  mint: PublicKey;
  /** ATA holding the NFT */
  tokenAccount: PublicKey;
  /** Owner wallet */
  owner: TestWallet;
  /** Token metadata (off-chain) */
  name: string;
  uri: string;
}

export interface CollectionEnvOptions {
  /** Number of NFTs in the collection (default: 5) */
  collectionSize?: number;
  /** Royalty basis points (default: 500 = 5%) */
  royaltyBps?: number;
  /** Number of buyer wallets (default: 3) */
  buyers?: number;
}

export interface CollectionEnv {
  /** Collection mint (authority = admin) */
  collectionMint: PublicKey;
  /** Creator / admin wallet */
  creator: TestWallet;
  /** Minted NFTs */
  nfts: NftSpec[];
  /** Buyer wallets with SOL */
  buyers: TestWallet[];
}

/**
 * NFT fixtures — creates mock NFT collections and marketplace environments.
 */
export class NftFixtures {
  /**
   * Create a mock NFT collection for marketplace/staking tests.
   *
   * @example
   *   const env = await fixtures.nft.collectionEnv(ctx, { collectionSize: 10 });
   *   const { nfts, creator, buyers } = env;
   */
  async collectionEnv(ctx: TestContext, options: CollectionEnvOptions = {}): Promise<CollectionEnv> {
    const {
      collectionSize = 5,
      royaltyBps = 500,
      buyers: buyerCount = 3,
    } = options;

    const creator = await ctx.wallets.named("nft-creator", { sol: 50 });

    // Collection mint (1 of 1 to represent the collection)
    const collectionMint = await createMint(
      ctx.connection,
      ctx.payer,
      creator.publicKey,
      creator.publicKey,
      0,
    );

    // Mint individual NFTs
    const nfts: NftSpec[] = [];
    for (let i = 0; i < collectionSize; i++) {
      const mint = await createMint(ctx.connection, ctx.payer, creator.publicKey, null, 0);
      const ata = await createAssociatedTokenAccount(ctx.connection, ctx.payer, mint, creator.publicKey);
      await mintTo(ctx.connection, ctx.payer, mint, ata, creator.keypair, 1);

      nfts.push({
        mint,
        tokenAccount: ata,
        owner: creator,
        name: `NFT #${i + 1}`,
        uri: `https://arweave.net/mock-metadata-${i + 1}`,
      });
    }

    const buyers = await ctx.wallets.createMany(buyerCount, { sol: 20 });

    return { collectionMint, creator, nfts, buyers };
  }

  /**
   * Create a single mock NFT owned by `owner`.
   */
  async createNft(ctx: TestContext, owner: TestWallet, name = "Test NFT"): Promise<NftSpec> {
    const mint = await createMint(ctx.connection, ctx.payer, owner.publicKey, null, 0);
    const tokenAccount = await createAssociatedTokenAccount(ctx.connection, ctx.payer, mint, owner.publicKey);
    await mintTo(ctx.connection, ctx.payer, mint, tokenAccount, owner.keypair, 1);

    return {
      mint,
      tokenAccount,
      owner,
      name,
      uri: "https://arweave.net/mock",
    };
  }

  /**
   * Transfer an NFT from one wallet to another.
   */
  async transferNft(ctx: TestContext, nft: NftSpec, to: TestWallet): Promise<NftSpec> {
    const toATA = await ctx.tokens.createATA(nft.mint, to.publicKey);
    const { transfer } = await import("@solana/spl-token");
    await transfer(ctx.connection, ctx.payer, nft.tokenAccount, toATA, nft.owner.keypair, 1);
    return { ...nft, tokenAccount: toATA, owner: to };
  }
}
