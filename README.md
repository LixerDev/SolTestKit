# 🧪 SolTestKit

<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/634554b1-da1f-4023-beca-72ed69861a13" />


**Built by LixerDev**
Follow me here on my personal Twitter (X): https://x.com/Lix_Devv

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![TypeScript](https://img.shields.io/badge/typescript-5.x-blue)
![Anchor](https://img.shields.io/badge/Anchor-0.30-orange)
![License](https://img.shields.io/badge/license-MIT-purple)

---

## 🚀 Quick Start

```bash
npm install @lixerdev/soltestkit --save-dev
```

```typescript
import { TestContext } from "@lixerdev/soltestkit";
import * as anchor from "@coral-xyz/anchor";

describe("my_staking", () => {
  let ctx: TestContext;

  before(async () => {
    ctx = await TestContext.create();
  });

  it("stakes and earns rewards", async () => {
    // One-line wallet creation with SOL funding
    const [alice, bob] = await ctx.wallets.createMany(2, { sol: 10 });

    // One-line SPL token setup
    const { mint } = await ctx.tokens.createMint({ decimals: 9 });
    const aliceATA = await ctx.tokens.createAndFund(mint, alice.publicKey, 1_000n * 10n ** 9n);

    // Mock a Pyth oracle price
    const oracle = await ctx.oracles.pyth.mockPrice("SOL/USD", { price: 150.0 });

    // Run your instruction
    const sig = await program.methods.stake(new BN(100_000_000)).accounts({...}).rpc();

    // Rich assertions
    await ctx.assert.tokenBalanceDecreased(aliceATA, 100_000_000n);
    await ctx.assert.accountExists(poolPDA);
    await ctx.assert.lamportsIncreased(treasury, 5_000);
  });

  it("accrues rewards after time", async () => {
    // Warp the validator clock forward
    await ctx.time.warpSeconds(3600);   // +1 hour
    await ctx.time.warpSlots(1000);     // +1000 slots

    // ... test time-dependent logic
  });
});
```

---

## 📦 What's Included

### `TestContext` — Central Test Environment
```typescript
const ctx = await TestContext.create({ cluster: "localnet" });
```

| Property | Description |
|---|---|
| `ctx.provider` | AnchorProvider (connection + wallet) |
| `ctx.connection` | Solana Connection |
| `ctx.wallets` | WalletFactory |
| `ctx.tokens` | TokenFactory |
| `ctx.oracles` | OracleFactory (Pyth + Switchboard + generic) |
| `ctx.cpi` | CpiMock |
| `ctx.time` | TimeTravel |
| `ctx.assert` | SolAssert |
| `ctx.accounts` | AccountBuilder |

---

### `WalletFactory` — Pre-funded Test Wallets
```typescript
// Single wallet with 5 SOL
const alice = await ctx.wallets.create({ sol: 5 });

// Multiple wallets at once
const [alice, bob, charlie] = await ctx.wallets.createMany(3, { sol: 10 });

// Named wallet (for readable test logs)
const deployer = await ctx.wallets.named("deployer", { sol: 100 });

// Wallet with exact lamports
const treasury = await ctx.wallets.create({ lamports: 2_039_280 });

// Check balances
const balance = await ctx.wallets.getBalance(alice);
```

---

### `TokenFactory` — SPL Token Mocks
```typescript
// Create a mint
const { mint, mintAuthority } = await ctx.tokens.createMint({
  decimals: 6,
  freezeAuthority: null,
});

// Create ATA + mint tokens in one call
const ata = await ctx.tokens.createAndFund(mint, owner.publicKey, 1_000_000n);

// Mint more tokens later
await ctx.tokens.mintTo(mint, ata, 500_000n);

// Get token balance
const balance = await ctx.tokens.getBalance(ata);

// Create a full token scenario (mint + multiple funded accounts)
const { mint, accounts } = await ctx.tokens.scenario({
  decimals: 9,
  holders: [
    { owner: alice.publicKey, amount: 1_000n * 10n ** 9n },
    { owner: bob.publicKey,   amount: 500n  * 10n ** 9n },
  ],
});
```

---

### `OracleFactory` — Price Feed Mocks

**Pyth:**
```typescript
const pythOracle = await ctx.oracles.pyth.mockPrice("SOL/USD", {
  price: 150.0,
  conf: 0.5,      // confidence interval
  expo: -8,       // price exponent
});

// Update price mid-test
await ctx.oracles.pyth.updatePrice(pythOracle, { price: 180.0 });
```

**Switchboard:**
```typescript
const sbOracle = await ctx.oracles.switchboard.mockFeed("SOL/USD", {
  value: 150.0,
  timestamp: Date.now() / 1000,
});

await ctx.oracles.switchboard.updateFeed(sbOracle, 180.0);
```

**Generic (any on-chain price store):**
```typescript
const genericOracle = await ctx.oracles.generic.create({
  price: 150_000_000n,  // raw u64 price
  decimals: 6,
});
```

---

### `TimeTravel` — Manipulate Validator Clock
```typescript
// Warp time forward
await ctx.time.warpSeconds(3600);       // +1 hour
await ctx.time.warpMinutes(30);
await ctx.time.warpDays(7);
await ctx.time.warpSlots(1000);         // +1000 slots

// Get current on-chain time
const { slot, unixTimestamp } = await ctx.time.now();

// Set absolute timestamp
await ctx.time.setUnixTimestamp(1700000000);

// Freeze time (stop slot progression)
await ctx.time.freeze();
await ctx.time.resume();
```

---

### `SolAssert` — Custom Assertions
```typescript
// Token balance assertions
await ctx.assert.tokenBalanceEquals(ata, 1_000_000n);
await ctx.assert.tokenBalanceDecreased(ata, 100_000n);
await ctx.assert.tokenBalanceIncreased(ata, 500_000n);

// SOL balance assertions
await ctx.assert.lamportsIncreased(wallet, 5_000n);
await ctx.assert.lamportsDecreased(wallet, 5_000n);

// Account state
await ctx.assert.accountExists(pda);
await ctx.assert.accountClosed(pda);
await ctx.assert.accountOwner(pda, programId);

// Instruction assertions
await ctx.assert.instructionFails(async () => {
  await program.methods.stake(new BN(-1)).rpc();
}, "ZeroAmount");

await ctx.assert.instructionSucceeds(async () => {
  await program.methods.initialize().rpc();
});

// Event assertions
await ctx.assert.eventEmitted(program, "StakeEvent", { user: alice.publicKey });
```

---

### `CpiMock` — Cross-Program Invocation Mocks
```typescript
// Create a mock program that records all CPIs made to it
const mockProgram = await ctx.cpi.createMockProgram();

// After executing an instruction, assert CPIs
await ctx.cpi.assertWasCalled(mockProgram, "transfer");
await ctx.cpi.assertCallCount(mockProgram, 2);
await ctx.cpi.assertNotCalled(mockProgram, "burn");
```

---

### `Fixtures` — Pre-Built Test Scenarios
```typescript
import { fixtures } from "@lixerdev/soltestkit";

// Set up a full DeFi test environment
const env = await fixtures.defi.stakingEnv(ctx, {
  stakeTokenDecimals: 9,
  rewardTokenDecimals: 6,
  initialStake: 1000,       // tokens per user
  users: 3,
});

// NFT test environment
const nftEnv = await fixtures.nft.collectionEnv(ctx, {
  collectionSize: 10,
  royaltyBps: 500,           // 5%
});
```

---

## 🏗️ Architecture

```
src/
├── index.ts          ← Re-exports everything
├── context.ts        ← TestContext — central hub
├── wallets.ts        ← WalletFactory
├── tokens.ts         ← TokenFactory (mints, ATAs, balances)
├── oracles.ts        ← OracleFactory (Pyth, Switchboard, generic)
├── cpi.ts            ← CpiMock (record + assert CPIs)
├── time.ts           ← TimeTravel (warp slot/timestamp)
├── assertions.ts     ← SolAssert (custom chai-style assertions)
├── accounts.ts       ← AccountBuilder (construct any account struct)
└── fixtures/
    ├── index.ts      ← Fixture registry
    ├── defi.ts       ← DeFi test scenarios
    └── nft.ts        ← NFT test scenarios

examples/
├── basic.test.ts     ← Minimal example using SolTestKit
└── staking.test.ts   ← Full staking program test with all features
```

# 🧪 Coin

<img width="1024" height="1024" alt="image" src="https://github.com/user-attachments/assets/97394a97-0e6f-425d-826b-30b0503e7e82" />
