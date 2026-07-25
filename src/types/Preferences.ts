import { SudokuCoordMode } from "./Sudoku";

export type PreferenceValue = boolean | number | string;

export const WORKER_NOTIFICATION_PREFERENCES = ["Disabled", "All", "OnlyWhenFull"] as const;
export type WorkerNotificationPreference = (typeof WORKER_NOTIFICATION_PREFERENCES)[number];

export const LEVEL_NOTIFICATION_PREFERENCES = ["Disabled", "All", "OnlyReward"] as const;
export type LevelNotificationPreference = (typeof LEVEL_NOTIFICATION_PREFERENCES)[number];

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
  worker: WorkerNotificationPreference;
  booster: boolean;
  payment: boolean;
  other: boolean;
  netWorth: number;
  autosellStatus: boolean;
  level: LevelNotificationPreference;
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
