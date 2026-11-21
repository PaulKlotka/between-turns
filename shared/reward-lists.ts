/** Public metadata only. Full immutable snapshots are owned by RPG Rewards. */
export interface RewardListReference {
  snapshotId: string;
  sourceListId: string;
  rpgId: string;
  rpgName: string;
  listName: string;
}

export const GENERAL_REWARD_LIST: RewardListReference = {
  snapshotId: 'starfinder-2e-general-v1', sourceListId: 'starfinder-2e-general',
  rpgId: 'starfinder 2e', rpgName: 'Starfinder 2E', listName: 'General List',
};
