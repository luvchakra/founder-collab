/**
 * Whether a prop is a promise the caller wants resolved with React's `use()`, or a plain
 * value to render as-is. The shell accepts both for data the dashboard layout streams
 * in behind Suspense (alerts, the AI-credits figure): a value handed across the
 * server/client boundary arrives as a real Promise, but duck-typing keeps this honest
 * for any thenable a test or another caller passes in.
 */
export function isPromiseLike<T>(value: T | PromiseLike<T> | undefined): value is PromiseLike<T> {
  return typeof (value as { then?: unknown } | undefined)?.then === "function";
}
