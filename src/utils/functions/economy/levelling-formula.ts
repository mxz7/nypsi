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

export const moneyFormula = (rawLevel: number) => {
  const level = rawLevel + 1;
  const multiplier = 0.65 + 0.25 / (1 + Math.pow(4500 / level, 2.35));

  return Math.floor(Math.pow(level, 2.1) * multiplier + 10_000) - 1;
};

export const cratesFormula = (rawLevel: number) => {
  const neededXp = calculateLevelXp(rawLevel);

  let crates = neededXp / 200;

  if (rawLevel < 1000) {
    if (rawLevel % 30 !== 0) crates = 0;
  } else if (rawLevel < 1500) {
    crates = neededXp / 250;
    if (rawLevel % 30 !== 0) crates = 0;
  } else if (rawLevel < 2000) {
    crates = neededXp / 250;
    if (rawLevel % 25 !== 0) crates = 0;
  } else if (rawLevel < 3000) {
    crates = neededXp / 350;
    if (rawLevel % 25 !== 0) crates = 0;
  } else if (rawLevel < 4000) {
    crates = neededXp / 400;
    if (rawLevel % 20 !== 0) crates = 0;
  } else if (rawLevel < 5000) {
    crates = neededXp / 450;
    if (rawLevel % 15 !== 0) crates = 0;
  } else if (rawLevel < 6000) {
    crates = neededXp / 500;
    if (rawLevel % 15 !== 0) crates = 0;
  } else if (rawLevel < 7000) {
    crates = neededXp / 500;
    if (rawLevel % 15 !== 0) crates = 0;
  } else {
    if (rawLevel < 8000) {
      crates = neededXp / 600;
    } else if (rawLevel < 9000) {
      crates = neededXp / 700;
    } else if (rawLevel < 10000) {
      crates = neededXp / 800;
    } else if (rawLevel < 11000) {
      crates = neededXp / 900;
    } else {
      crates = neededXp / 1000;
    }

    if (rawLevel % 15 !== 0) crates = 0;
  }

  return Math.floor(crates);
};
