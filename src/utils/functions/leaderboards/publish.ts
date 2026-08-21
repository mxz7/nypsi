import redis from "../../../init/redis";
import { logger } from "../../logger";
import { RedisPubSub } from "../../pubsub";

export type LeaderboardChannel =
  | "balance"
  | "net-worth"
  | "level"
  | "guilds"
  | "streak"
  | "lottery"
  | "commands"
  | "clicks"
  | "vote-month"
  | "vote-streak"
  | "wordle-wins"
  | "wordle-time"
  | "chess-solved"
  | "chess-rating"
  | "chess-fastest"
  | "chatreaction-daily"
  | "chatreaction-alltime"
  | "flag-wins"
  | "flag-time"
  | "sudoku-solved"
  | "sudoku-fastest"
  | `item-${string}`;

type LeaderboardUpdate = {
  entityId: string;
  value: string;
  increment?: true;
};

type LeaderboardConnection = {
  pubsub: RedisPubSub<LeaderboardUpdate>;
  inactivityTimeout: ReturnType<typeof setTimeout>;
};

const CONNECTION_INACTIVITY_MS = 15 * 60 * 1000;
const connections = new Map<LeaderboardChannel, LeaderboardConnection>();

export function publishLeaderboardUpdate(
  leaderboard: LeaderboardChannel,
  entityId: string,
  value: string | Promise<string | undefined>,
  increment?: true,
): void {
  if (typeof value !== "string") {
    void value
      .then((resolvedValue) => {
        if (resolvedValue !== undefined) {
          publishLeaderboardUpdate(leaderboard, entityId, resolvedValue, increment);
        }
      })
      .catch((error) => logPublishError(leaderboard, entityId, error));
    return;
  }

  let connection = connections.get(leaderboard);

  if (!connection) {
    const pubsub = new RedisPubSub<LeaderboardUpdate>(redis, `nypsi:leaderboard:${leaderboard}`);
    connection = {
      pubsub,
      inactivityTimeout: scheduleConnectionClose(leaderboard, pubsub),
    };
    connections.set(leaderboard, connection);
    logger.debug(`leaderboard: created pubsub connection for ${leaderboard}`);
  } else {
    clearTimeout(connection.inactivityTimeout);
    connection.inactivityTimeout = scheduleConnectionClose(leaderboard, connection.pubsub);
  }

  void connection.pubsub.publish({ entityId, value, increment }).catch((error) => {
    logPublishError(leaderboard, entityId, error);
  });
}

function logPublishError(leaderboard: LeaderboardChannel, entityId: string, error: unknown) {
  void logger.warn("leaderboard: failed to publish update", {
    leaderboard,
    entityId,
    error,
  });
}

function scheduleConnectionClose(
  leaderboard: LeaderboardChannel,
  pubsub: RedisPubSub<LeaderboardUpdate>,
) {
  const timeout = setTimeout(() => {
    const connection = connections.get(leaderboard);

    if (connection?.pubsub !== pubsub) return;

    pubsub.close();
    connections.delete(leaderboard);
    logger.debug(`leaderboard: closed pubsub connection for ${leaderboard}`);
  }, CONNECTION_INACTIVITY_MS);

  timeout.unref();

  return timeout;
}
