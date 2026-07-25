import { expect, test } from "vitest";
import { readLines } from "./helpers";

const wordleWords = readLines("data/wordle.txt");
const wordleGuesses = readLines("data/wordle_guesses.txt");

test("wordle.txt - every word should be 5 characters and lowercase", () => {
  for (const word of wordleWords) {
    expect.soft(word, `invalid word "${word}"`).toMatch(/^[a-z]{5}$/);
  }
});

test("wordle_guesses.txt - every word should be 5 characters and lowercase", () => {
  for (const word of wordleGuesses) {
    expect.soft(word, `invalid word "${word}"`).toMatch(/^[a-z]{5}$/);
  }
});

test("wordle.txt should have no duplicate words", () => {
  const uniqueWords = new Set(wordleWords);

  expect(uniqueWords.size).toBe(wordleWords.length);
});

test("wordle_guesses.txt should have no duplicate words", () => {
  const uniqueWords = new Set(wordleGuesses);

  expect(uniqueWords.size).toBe(wordleGuesses.length);
});
