import { LevelDmSetting, SudokuCoordMode, WorkerDmSetting } from "#generated/prisma";

export type PreferenceValue = boolean | number | string;

export interface PreferenceData {
  id: string;
  name: string;
  description: string;
  default: PreferenceValue;
  types?: { name: string; description: string; value: string }[];
}

export interface Preferences {
  rob: boolean;
  lottery: boolean;
  premium: boolean;
  market: boolean;
  voteReminder: boolean;
  worker: WorkerDmSetting;
  booster: boolean;
  payment: boolean;
  other: boolean;
  netWorth: number;
  autosellStatus: boolean;
  level: LevelDmSetting;
  farmHealth: boolean;
  duelRequests: boolean;
  offers: number;
  leaderboards: boolean;
  tips: boolean;
  marketConfirm: number;
  marketDelay: number;
  mentionsGlobal: boolean;
  sudokuCoordMode: SudokuCoordMode;
}
