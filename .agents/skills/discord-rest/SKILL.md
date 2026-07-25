---
name: discord-rest
description: Prefer the shared Discord REST client for Discord API operations from the main process, API controllers, jobs, or utilities. Use when fetching or mutating Discord resources without an existing NypsiClient instance.
---

# Discord REST

Use `getRest()` from `src/utils/rest.ts` with `Routes` from `discord-api-types/v10` for Discord API reads and writes from the main process.

Prefer REST over `ClusterManager.broadcastEval`. Use broadcast evaluation only when the operation genuinely depends on gateway-only or process-local client state that Discord's REST API cannot provide.
