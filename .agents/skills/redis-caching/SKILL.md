---
name: redis-caching
description: Explains why plain JSON.stringify/parse breaks when caching Prisma results that contain BigInt fields, and the RedisCache class that fixes it. Use before caching any Prisma model result in Redis.
---

# Redis Caching & BigInt

Several Prisma models use `BigInt` fields (e.g. `ProfileView`). Plain `JSON.stringify`/`JSON.parse` throws on `BigInt`, which breaks naive Redis caching of these rows.

Use the custom `RedisCache` class from [src/utils/cache.ts](../../../src/utils/cache.ts) - it handles `BigInt` serialization/deserialization automatically. Don't hand-roll `JSON.stringify` for caching Prisma results without checking the model for `BigInt` fields first.

## Structured Redis data

All structured values sent through Redis must use `redisSerialize` and `redisDeserialize` from `src/utils/cache.ts`, including pub/sub messages. Low-level Redis transport wrappers such as `RedisPubSub` should call the codec directly; ordinary cache consumers should use `RedisCache<T>`. Never use plain `JSON.stringify` / `JSON.parse` for structured Redis data.

## Shared guild settings

Guild prefixes, slash-only mode, and disabled channels use `RedisCache` so the bot clusters and main API process share one cache. Code that updates these settings outside their setters must delete the corresponding Redis key after the database update.

## Moderation alt groups

`src/utils/functions/moderation/alts.ts` shares `cache:guilds:alts:<guildId>:<userId>` between all alt readers. Each main and alt key must contain the **complete array** of Prisma alt relationships for the group, excluding a synthetic main-to-main entry. `[]` means no linked accounts. Group caches expire after six hours; standalone-account caches expire after 24 hours.

The August 2026 correction of a trailing `}` in the writer's key exposed an older object/array mismatch: caching one `{ mainId, altId }` object makes `getAllGroupAccountIds` throw when reading `parsed[0].mainId`. Cache the full `findMany` result. Preserve whole-group cache invalidation when adding or deleting links. Readers do not support the old single-object format; those existing keys need to expire or be cleared when deploying the fix.
