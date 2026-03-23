/**
 * DeFi Fixtures — Pre-built test environments for DeFi program testing.
 * Built by LixerDev / SolTestKit
 */

import { PublicKey } from "@solana/web3.js";
import { TestContext } from "../context";
import { TestWallet } from "../wallets";

export interface StakingEnvOptions {
  /** Stake token decimals (default: 9) */
  stakeTokenDecimals?: number;
  /** Reward token decimals (default: 6) */
  rewardTokenDecimals?: number;
  /** Initial stake token amount per user (in human units, default: 1000) */
  initialStake?: number;
  /** Number of test users to create (default: 3) */
  users?: number;
  /** Initial SOL per user (default: 10) */
  solPerUser?: number;
}

export interface StakingEnv {
  stakeMint: PublicKey;
  rewardMint: PublicKey;
  users: Array<{
    wallet: TestWallet;
    stakeATA: PublicKey;
    rewardATA: PublicKey;
  }>;
  admin: TestWallet;
}

export interface EscrowEnvOptions {
  tokenDecimals?: number;
  buyerInitialBalance?: number;
  users?: number;
}

export interface EscrowEnv {
  paymentMint: PublicKey;
  buyer: TestWallet;
  seller: TestWallet;
  buyerATA: PublicKey;
  sellerATA: PublicKey;
}

export interface LendingEnvOptions {
  collateralDecimals?: number;
  borrowableDecimals?: number;
  initialCollateral?: number;
  users?: number;
}

export interface LendingEnv {
  collateralMint: PublicKey;
  borrowableMint: PublicKey;
  admin: TestWallet;
  borrowers: Array<{
    wallet: TestWallet;
    collateralATA: PublicKey;
    borrowableATA: PublicKey;
  }>;
}

/**
 * DeFi fixtures — sets up complete test environments with wallets,
 * mints, and funded token accounts.
 */
export class DefiFixtures {
  /**
   * Create a complete staking test environment.
   *
   * Returns:
   * - stakeMint: The token users will stake
   * - rewardMint: The token users will earn as rewards
   * - users[]: Funded wallets with stake token ATAs
   * - admin: The protocol admin wallet
   *
   * @example
   *   const env = await fixtures.defi.stakingEnv(ctx, { users: 3 });
   *   const { stakeMint, users, admin } = env;
   */
  async stakingEnv(ctx: TestContext, options: StakingEnvOptions = {}): Promise<StakingEnv> {
    const {
      stakeTokenDecimals = 9,
      rewardTokenDecimals = 6,
      initialStake = 1000,
      users: userCount = 3,
      solPerUser = 10,
    } = options;

    const admin = await ctx.wallets.named("admin", { sol: 100 });

    // Create mints
    const { mint: stakeMint } = await ctx.tokens.createMint({ decimals: stakeTokenDecimals });
    const { mint: rewardMint } = await ctx.tokens.createMint({ decimals: rewardTokenDecimals });

    // Create user wallets and fund them
    const wallets = await ctx.wallets.createMany(userCount, { sol: solPerUser });

    const users = await Promise.all(
      wallets.map(async (wallet) => {
        const stakeAmount = BigInt(initialStake) * 10n ** BigInt(stakeTokenDecimals);
        const stakeATA = await ctx.tokens.createAndFund(stakeMint, wallet.publicKey, stakeAmount);
        const rewardATA = await ctx.tokens.createATA(rewardMint, wallet.publicKey);

        return { wallet, stakeATA, rewardATA };
      })
    );

    return { stakeMint, rewardMint, users, admin };
  }

  /**
   * Create a simple escrow test environment with buyer + seller.
   */
  async escrowEnv(ctx: TestContext, options: EscrowEnvOptions = {}): Promise<EscrowEnv> {
    const {
      tokenDecimals = 6,
      buyerInitialBalance = 10_000,
    } = options;

    const [buyer, seller] = await ctx.wallets.createMany(2, { sol: 10 });
    const { mint: paymentMint } = await ctx.tokens.createMint({ decimals: tokenDecimals });

    const buyerAmount = BigInt(buyerInitialBalance) * 10n ** BigInt(tokenDecimals);
    const buyerATA = await ctx.tokens.createAndFund(paymentMint, buyer.publicKey, buyerAmount);
    const sellerATA = await ctx.tokens.createATA(paymentMint, seller.publicKey);

    return { paymentMint, buyer, seller, buyerATA, sellerATA };
  }

  /**
   * Create a lending/borrowing test environment.
   */
  async lendingEnv(ctx: TestContext, options: LendingEnvOptions = {}): Promise<LendingEnv> {
    const {
      collateralDecimals = 9,
      borrowableDecimals = 6,
      initialCollateral = 5000,
      users: userCount = 2,
    } = options;

    const admin = await ctx.wallets.named("admin", { sol: 100 });
    const { mint: collateralMint } = await ctx.tokens.createMint({ decimals: collateralDecimals });
    const { mint: borrowableMint } = await ctx.tokens.createMint({ decimals: borrowableDecimals });

    const wallets = await ctx.wallets.createMany(userCount, { sol: 10 });

    const borrowers = await Promise.all(
      wallets.map(async (wallet) => {
        const collAmount = BigInt(initialCollateral) * 10n ** BigInt(collateralDecimals);
        const collateralATA = await ctx.tokens.createAndFund(collateralMint, wallet.publicKey, collAmount);
        const borrowableATA = await ctx.tokens.createATA(borrowableMint, wallet.publicKey);
        return { wallet, collateralATA, borrowableATA };
      })
    );

    return { collateralMint, borrowableMint, admin, borrowers };
  }

  /**
   * Create a DAO voting test environment.
   */
  async daoEnv(ctx: TestContext, options: { votingPower?: number; voters?: number } = {}) {
    const { votingPower = 1000, voters: voterCount = 5 } = options;

    const admin = await ctx.wallets.named("dao-admin", { sol: 100 });
    const { mint: govMint } = await ctx.tokens.createMint({ decimals: 6 });

    const voters = await ctx.wallets.createMany(voterCount, { sol: 5 });
    const voterATAs = await Promise.all(
      voters.map(async (v) => {
        const amount = BigInt(votingPower) * 10n ** 6n;
        return ctx.tokens.createAndFund(govMint, v.publicKey, amount);
      })
    );

    return {
      govMint, admin,
      voters: voters.map((v, i) => ({ wallet: v, govATA: voterATAs[i] })),
    };
  }
}
