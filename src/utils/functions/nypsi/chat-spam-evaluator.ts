import { compareTwoStrings } from "string-similarity";

const PUNISHMENT_SCORE = 8;

type ChatHistoryEntry = {
  content: string;
  createdAt: number;
};

export type ChatSpamState = {
  history: ChatHistoryEntry[];
  score: number;
  updatedAt: number;
};

export type ChatSpamEvaluation = {
  causes: Array<{
    type: "similar-length" | "short-without-spaces" | "similar-content" | "rapid-messages";
    points: number;
    data: Record<string, number>;
  }>;
  pointsAdded: number;
  scoreAfter: number;
  scoreBefore: number;
  shouldTimeout: boolean;
  state: ChatSpamState;
};

function normalizeContent(content: string) {
  return content
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " url ")
    .replace(/<@!?\d+>|<@&\d+>|<#\d+>/g, " mention ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isShortMessageWithoutSpaces(content: string) {
  if (content.length === 0 || content.length > 12) return false;

  // Only letters and numbers are allowed; spaces and punctuation make this false.
  return /^[\p{L}\p{N}]+$/u.test(content);
}

export function evaluateNypsiChatMessage(
  content: string,
  now: number,
  previousState?: ChatSpamState,
): ChatSpamEvaluation {
  const state = previousState ?? { history: [], score: 0, updatedAt: now };
  const normalized = normalizeContent(content);
  const history = state.history.filter((entry) => entry.createdAt > now - 30000);
  const recentFiveSeconds = history.filter((entry) => entry.createdAt > now - 5000).length + 1;
  const recentFifteenSeconds = history.filter((entry) => entry.createdAt > now - 15000).length + 1;
  const similarLengthMessages = normalized.length
    ? history.filter(
        (entry) =>
          Math.abs(entry.content.length - normalized.length) /
            Math.max(entry.content.length, normalized.length) <=
          0.05,
      ).length
    : 0;
  const shortMessageWithoutSpaces = isShortMessageWithoutSpaces(normalized);
  const recentShortMessagesWithoutSpaces = shortMessageWithoutSpaces
    ? history.filter((entry) => isShortMessageWithoutSpaces(entry.content)).length
    : 0;

  const causes: ChatSpamEvaluation["causes"] = [];
  const rapidMessages = recentFiveSeconds >= 5 || recentFifteenSeconds >= 8;

  if (similarLengthMessages >= 5) {
    causes.push({
      type: "similar-length",
      points: 1,
      data: { currentLength: normalized.length, matchingMessages: similarLengthMessages },
    });
  }

  if (recentShortMessagesWithoutSpaces >= 4) {
    causes.push({
      type: "short-without-spaces",
      points: 2,
      data: { matchingMessages: recentShortMessagesWithoutSpaces },
    });
  }

  if (normalized.length >= 4) {
    const similarity = history.reduce(
      (highest, entry) =>
        entry.content.length >= 4
          ? Math.max(highest, compareTwoStrings(entry.content, normalized))
          : highest,
      0,
    );

    if (similarity >= 0.9) {
      causes.push({
        type: "similar-content",
        points: 2,
        data: { similarity },
      });
    }
  } else {
    const matchingMessages = history.filter((entry) => entry.content === normalized).length;

    if (matchingMessages >= 2) {
      causes.push({
        type: "similar-content",
        points: 2,
        data: { matchingMessages, similarity: 1 },
      });
    }
  }

  if (rapidMessages && causes.length > 0) {
    causes.push({
      type: "rapid-messages",
      points: 1,
      data: { recentFiveSeconds, recentFifteenSeconds },
    });
  }

  const pointsAdded = causes.reduce((total, cause) => total + cause.points, 0);
  const decay = Math.floor(Math.max(0, now - state.updatedAt) / 30000);
  const scoreBefore = Math.max(0, state.score - decay);
  const scoreAfter = scoreBefore + pointsAdded;
  const shouldTimeout = scoreAfter >= PUNISHMENT_SCORE;

  return {
    causes,
    pointsAdded,
    scoreAfter,
    scoreBefore,
    shouldTimeout,
    state: {
      history: shouldTimeout
        ? []
        : [...history, { content: normalized, createdAt: now }].slice(-10),
      score: shouldTimeout ? 0 : scoreAfter,
      updatedAt: now,
    },
  };
}
