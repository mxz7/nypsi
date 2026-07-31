const integratedSmoothstep = (value: number) => {
  if (value <= 0) return 0;
  if (value >= 1) return value - 0.5;

  return value ** 3 - value ** 4 / 2;
};

const smoothstep = (value: number) => {
  if (value <= 0) return 0;
  if (value >= 1) return 1;

  return value ** 2 * (3 - 2 * value);
};

const crateDivisorTransitions = [
  { startPrestige: 5, duration: 10, increase: 50 },
  { startPrestige: 15, duration: 10, increase: 100 },
  { startPrestige: 25, duration: 10, increase: 50 },
  { startPrestige: 35, duration: 10, increase: 50 },
  { startPrestige: 45, duration: 10, increase: 50 },
  { startPrestige: 60, duration: 20, increase: 100 },
  { startPrestige: 75, duration: 10, increase: 100 },
  { startPrestige: 85, duration: 10, increase: 100 },
  { startPrestige: 95, duration: 10, increase: 100 },
  { startPrestige: 105, duration: 10, increase: 100 },
] as const;

export const calculateLevelXp = (rawLevel: number) => {
  const prestige = Math.floor(rawLevel / 100);
  const level = rawLevel % 100;

  const earlyToMid = 47 * prestige + 648 * integratedSmoothstep(prestige / 8);
  const latePrestige = Math.max(0, prestige - 50);
  const establishedGrowth = 77 * ((latePrestige + 4) ** 1.5 - 3 * latePrestige - 8);
  const shoulderPrestige = Math.max(0, prestige - 45);
  const shoulderProgress = shoulderPrestige / 10;
  const midgameShoulder = 2_570 * (1 - (1 + shoulderProgress) * Math.exp(-shoulderProgress));

  return Math.floor((level + 1) * 1.77 + earlyToMid + establishedGrowth + midgameShoulder + 50) - 1;
};

export const moneyFormula = (rawLevel: number) => {
  const level = rawLevel + 1;
  const multiplier = 0.65 + 0.25 / (1 + Math.pow(4500 / level, 2.35));

  return Math.floor(Math.pow(level, 2.1) * multiplier + 10_000) - 1;
};

const calculateAveragePrestigeXp = (prestige: number) => {
  let totalXp = 0;

  for (let level = 0; level < 100; level++) {
    totalXp += calculateLevelXp(prestige * 100 + level);
  }

  return totalXp / 100;
};

const calculateCrateDivisor = (prestige: number) => {
  return crateDivisorTransitions.reduce((divisor, transition) => {
    const progress = (prestige - transition.startPrestige) / transition.duration;

    return divisor + transition.increase * smoothstep(progress);
  }, 200);
};

const getCrateRewardInterval = (rawLevel: number) => {
  if (rawLevel < 1500) return 30;
  if (rawLevel < 3000) return 25;
  if (rawLevel < 4000) return 20;

  return 15;
};

export const cratesFormula = (rawLevel: number) => {
  if (rawLevel % getCrateRewardInterval(rawLevel) !== 0) return 0;

  const prestige = Math.floor(rawLevel / 100);
  const averageXp = calculateAveragePrestigeXp(prestige);
  const divisor = calculateCrateDivisor(prestige);

  return Math.max(1, Math.floor(averageXp / divisor));
};
