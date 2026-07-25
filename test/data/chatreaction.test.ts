import { expect, test } from "vitest";
import { readLines } from "./helpers";

const wordLists = ["english_1k", "english_5k", "english_10k"];

test.each(wordLists)("%s.txt - every word should contain only lowercase letters", (wordList) => {
  const words = readLines(`data/chatreaction/${wordList}.txt`);
  const loadedWords = words.filter((word) => word.length > 2);

  for (const word of words) {
    expect.soft(word, `word "${word}" should contain only lowercase letters`).toMatch(/^[a-z]+$/);
  }

  expect
    .soft(new Set(loadedWords).size, `${wordList}.txt should not load duplicate words`)
    .toBe(loadedWords.length);
});
