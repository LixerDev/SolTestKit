/**
 * SolTestKit — TypeScript testing framework for Anchor programs.
 * Built by LixerDev
 *
 * @example
 *   import { TestContext, fixtures } from "@lixerdev/soltestkit";
 *
 *   const ctx = await TestContext.create();
 *   const [alice] = await ctx.wallets.createMany(1, { sol: 10 });
 *   const { mint } = await ctx.tokens.createMint({ decimals: 9 });
 */

export { TestContext, TestContextOptions } from "./context";
export { WalletFactory, TestWallet, WalletOptions } from "./wallets";
export {
  TokenFactory,
  CreateMintOptions,
  MintResult,
  HolderSpec,
  TokenScenarioOptions,
  TokenScenarioResult,
} from "./tokens";
export {
  OracleFactory,
  PythOracleMock,
  PythPriceFeed,
  PythPriceOptions,
  SwitchboardOracleMock,
  SwitchboardFeed,
  SwitchboardFeedOptions,
  GenericOracleMock,
  GenericOracle,
  GenericOracleOptions,
} from "./oracles";
export { CpiMock, CpiRecord } from "./cpi";
export { TimeTravel, ClockState } from "./time";
export { SolAssert, AssertionError } from "./assertions";
export { AccountBuilder, RawAccountSpec } from "./accounts";

// Fixtures
export { fixtures, DefiFixtures, NftFixtures } from "./fixtures";
export type { StakingEnv, StakingEnvOptions, EscrowEnv, LendingEnv } from "./fixtures/defi";
export type { CollectionEnv, NftSpec, CollectionEnvOptions } from "./fixtures/nft";
