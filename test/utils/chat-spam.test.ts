import { describe, expect, test } from "vitest";
import {
  ChatSpamState,
  evaluateNypsiChatMessage,
  PUNISHMENT_SCORE,
} from "../../src/utils/functions/nypsi/chat-spam-evaluator";

function evaluateMessages(messages: { content: string; at: number }[]) {
  let state: ChatSpamState;

  return messages.map(({ content, at }) => {
    const evaluation = evaluateNypsiChatMessage(content, at, state);
    state = evaluation.state;
    return evaluation;
  });
}

describe("nypsi chat spam", () => {
  test("does not punish speed without another spam signal", () => {
    const evaluations = evaluateMessages(
      [
        "yes",
        "that makes sense",
        "what happened next?",
        "i had not seen that",
        "probably tomorrow then",
        "send it when ready please",
        "thanks",
        "bye",
      ].map((content, index) => ({ content, at: 1000 + index * 500 })),
    );

    expect(evaluations.some((evaluation) => evaluation.shouldTimeout)).toBe(false);
    expect(evaluations.every((evaluation) => evaluation.causes.length === 0)).toBe(true);
  });

  test("scores repeated messages", () => {
    const evaluation = evaluateNypsiChatMessage("give me task progress", 6000, {
      history: [{ content: "give me task progress", createdAt: 1000 }],
      score: 0,
      updatedAt: 1000,
    });

    expect(evaluation.causes).toContainEqual({
      type: "similar-content",
      points: 2,
      data: { similarity: 1 },
    });
  });

  test("scores a sustained run of short messages without spaces", () => {
    const evaluation = evaluateNypsiChatMessage("zxaadv", 26000, {
      history: [
        { content: "xjklqwrz", createdAt: 1000 },
        { content: "abaca", createdAt: 6000 },
        { content: "abaavac", createdAt: 11000 },
        { content: "asdasdqq", createdAt: 16000 },
      ],
      score: 0,
      updatedAt: 16000,
    });

    expect(evaluation.causes).toContainEqual({
      type: "short-without-spaces",
      points: 2,
      data: { matchingMessages: 4 },
    });
  });

  test("scores a run of similarly sized messages", () => {
    const evaluation = evaluateNypsiChatMessage("dry eel map", 26000, {
      history: ["red fox one", "big cat two", "new dog six", "old hen ten", "fun yak zip"].map(
        (content, index) => ({ content, createdAt: 1000 + index * 5000 }),
      ),
      score: 0,
      updatedAt: 21000,
    });

    expect(evaluation.causes).toContainEqual({
      type: "similar-length",
      points: 1,
      data: { currentLength: 11, matchingMessages: 5 },
    });
  });

  test("decays old spam score", () => {
    const evaluations = evaluateMessages([
      { content: "xjklqwrz", at: 1000 },
      { content: "a normal conversational message", at: 62000 },
    ]);

    expect(evaluations.at(-1).shouldTimeout).toBe(false);
  });

  test("includes short messages in spam scoring", () => {
    const evaluation = evaluateNypsiChatMessage("a", 11000, {
      history: [
        { content: "a", createdAt: 1000 },
        { content: "a", createdAt: 6000 },
      ],
      score: 0,
      updatedAt: 6000,
    });

    expect(evaluation.causes).toContainEqual({
      type: "similar-content",
      points: 2,
      data: { matchingMessages: 2, similarity: 1 },
    });
  });

  test("times out when the punishment score is reached", () => {
    const evaluation = evaluateNypsiChatMessage("same message", 6000, {
      history: [{ content: "same message", createdAt: 1000 }],
      score: Math.max(0, PUNISHMENT_SCORE - 2),
      updatedAt: 6000,
    });

    expect(evaluation.shouldTimeout).toBe(true);
    expect(evaluation.state.score).toBe(0);
    expect(evaluation.state.history).toEqual([]);
  });
});
