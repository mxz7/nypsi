import { CacheFactory, CacheWithLimitsOptions, LimitedCollection, Options } from "discord.js";

export function cacheWithSharedEmpty(settings: CacheWithLimitsOptions): CacheFactory {
  const fallback = Options.cacheWithLimits(settings);
  const empty = new LimitedCollection<string, never>({ maxSize: 0 });
  Object.freeze(empty);

  return (managerType, holds, manager) => {
    const setting = settings[manager.name] ?? settings[managerType.name];
    if (
      setting === 0 ||
      (typeof setting === "object" && setting?.maxSize === 0 && !setting.keepOverLimit)
    ) {
      return empty;
    }

    return fallback(managerType, holds, manager);
  };
}
