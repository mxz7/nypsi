---
name: cmd-channel-autoscaling
description: Maintain Nypsi's automatic command-channel capacity tracking, including rolling load activity, sustained-activity windows, inactivity closure, resize cooldowns, and minimum channel count. Use when changing cmd channel activity tracking or autoscaling behavior.
---

# Command channel autoscaling

Track scale-up load as one combined activity stream:

- Add non-bot `messageCreate` events to `trackCmdChannelLoad()` with a `message` source.
- Add chat-input interactions to the same tracker with a `slash-command` source.
- Store both in the same load activity Redis sorted set. Do not count bot replies, components, or autocomplete toward scale-up load.

Evaluate the combined activity in `src/scheduled/clusterjobs/cmd-channels.ts`. Split the trailing
60 seconds into two 30-second halves. Every active channel must meet
`LOAD_EVENTS_PER_HALF_WINDOW` in both halves before opening another channel. Keeping two halves
requires sustained load instead of allowing one short burst to trigger scaling.

Scale-down uses the separate activity TTL key. Messages and interactions refresh that 10-minute
TTL. Only the highest-numbered active channel is a removal candidate, and never reduce below
`MIN_CHANNELS`.

Run `make check` after changes.
