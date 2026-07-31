const integratedSmoothstep = (value: number) => {
  if (value <= 0) return 0;
  if (value >= 1) return value - 0.5;

  return value ** 3 - value ** 4 / 2;
};

export const calculateLevelXp = (rawLevel: number) => {
  const prestige = Math.floor(rawLevel / 100);
  const level = rawLevel % 100;

  const earlyToMid = 47 * prestige + 648 * integratedSmoothstep(prestige / 8);
  const latePrestige = Math.max(0, prestige - 50);
  const establishedGrowth = 77 * ((latePrestige + 4) ** 1.5 - 3 * latePrestige - 8);
  const shoulderProgress = latePrestige / 10;
  const midgameShoulder = 2_320 * (1 - (1 + shoulderProgress) * Math.exp(-shoulderProgress));

  return Math.floor((level + 1) * 1.77 + earlyToMid + establishedGrowth + midgameShoulder + 50) - 1;
};
