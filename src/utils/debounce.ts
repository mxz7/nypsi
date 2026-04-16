/**
 * Creates a keyed trailing debounce wrapper around an async function.
 * Calls with the same key within `delay` ms will reset the timer;
 * the function fires once after `delay` ms of inactivity for that key.
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void | Promise<void>,
  delay: number,
): (key: string, ...args: TArgs) => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  return (key: string, ...args: TArgs) => {
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);

    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        fn(...args);
      }, delay),
    );
  };
}
