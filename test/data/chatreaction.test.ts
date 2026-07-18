import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

const wordLists = ["english_1k", "english_5k", "english_10k"];

test.each(wordLists)("%s.txt - every word should contain only lowercase letters", (wordList) => {
  const words = readFileSync(`data/chatreaction/${wordList}.txt`, "utf-8").split("\n");

  for (const word of words) {
    expect.soft(word, `word "${word}" should contain only a-z`).toMatch(/^[a-z]+$/);
  }
});
