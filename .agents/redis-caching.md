# Redis Caching & BigInt

Several Prisma models use `BigInt` fields (e.g. `ProfileView`). Plain `JSON.stringify`/`JSON.parse` throws on `BigInt`, which breaks naive Redis caching of these rows.

Use the custom `RedisCache` class from [src/utils/cache.ts](../src/utils/cache.ts) - it handles `BigInt` serialization/deserialization automatically. Don't hand-roll `JSON.stringify` for caching Prisma results without checking the model for `BigInt` fields first.
