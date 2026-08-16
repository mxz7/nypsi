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
