import { readFileSync } from "node:fs";
import { expect, test } from "vitest";

// remove \r for windows
const wordleWords: string[] = readFileSync("data/wordle.txt", "utf-8").trim().replaceAll("\r", "").split("\n");

const wordleGuesses: string[] = readFileSync("data/wordle_guesses.txt", "utf-8").trim().replaceAll("\r", "").split("\n");

test("wordle.txt - every word should be 5 characters and lowercase", () => {
  for (const word of wordleWords) {
    expect.soft(word, `word "${word}" is not lowercase`).toBe(word.toLowerCase());
    expect.soft(word.length, `word "${word}" is not 5 characters long`).toBe(5);
  }
});

test("wordle_guesses.txt - every word should be 5 characters and lowercase", () => {
  for (const word of wordleGuesses) {
    expect.soft(word, `word "${word}" is not lowercase`).toBe(word.toLowerCase());
    expect.soft(word.length, `word "${word}" is not 5 characters long`).toBe(5);
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
