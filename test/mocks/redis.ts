import { vi } from "vitest";

export function createRedisMock() {
  return {
    eval: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
  };
}

export type RedisMock = ReturnType<typeof createRedisMock>;

export function resetRedisMock(redisMock: RedisMock) {
  for (const method of Object.values(redisMock)) {
    method.mockReset();
  }
}
