import { describe, expect, test } from "vitest";
import {
  ChatSpamState,
  evaluateNypsiChatMessage,
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

  test("times out repeated messages", () => {
    const evaluations = evaluateMessages([
      { content: "give me task progress", at: 1000 },
      { content: "give me task progress", at: 6000 },
      { content: "give me task progress", at: 11000 },
      { content: "give me task progress", at: 16000 },
    ]);

    expect(evaluations.at(-1).shouldTimeout).toBe(true);
  });

  test("times out a sustained run of short messages without spaces", () => {
    const evaluations = evaluateMessages([
      { content: "xjklqwrz", at: 1000 },
      { content: "abaca", at: 6000 },
      { content: "abaavac", at: 11000 },
      { content: "asdasdqq", at: 16000 },
      { content: "acadqq", at: 21000 },
      { content: "qwqrzc", at: 26000 },
      { content: "zxaadv", at: 31000 },
    ]);

    expect(evaluations.at(-1).shouldTimeout).toBe(true);
  });

  test("times out a run of similarly sized messages", () => {
    const evaluations = evaluateMessages(
      [
        "red fox one",
        "big cat two",
        "new dog six",
        "old hen ten",
        "fun yak zip",
        "dry eel map",
        "wet owl run",
        "tan ant hop",
        "fat emu jog",
        "wee cod dig",
        "mad ram nod",
      ].map((content, index) => ({ content, at: 1000 + index * 5000 })),
    );

    expect(evaluations.at(-1).shouldTimeout).toBe(true);
    expect(evaluations.at(-1).causes).toEqual([
      {
        type: "similar-length",
        points: 1,
        data: { currentLength: 11, matchingMessages: 5 },
      },
    ]);
    expect(evaluations.at(-1).scoreAfter).toBe(6);
  });

  test("decays old spam score", () => {
    const evaluations = evaluateMessages([
      { content: "xjklqwrz", at: 1000 },
      { content: "a normal conversational message", at: 62000 },
    ]);

    expect(evaluations.at(-1).shouldTimeout).toBe(false);
  });

  test("includes short messages in spam scoring", () => {
    const evaluations = evaluateMessages([
      { content: "a", at: 1000 },
      { content: "a", at: 6000 },
      { content: "a", at: 11000 },
      { content: "a", at: 16000 },
      { content: "a", at: 21000 },
    ]);

    expect(evaluations.some((evaluation) => evaluation.shouldTimeout)).toBe(true);
  });
});
