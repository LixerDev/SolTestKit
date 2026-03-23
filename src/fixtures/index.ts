/**
 * Fixtures — Pre-built test environments.
 * Built by LixerDev / SolTestKit
 */

export { DefiFixtures } from "./defi";
export { NftFixtures } from "./nft";

import { DefiFixtures } from "./defi";
import { NftFixtures } from "./nft";

/** Unified fixture registry. */
export const fixtures = {
  defi: new DefiFixtures(),
  nft: new NftFixtures(),
};
