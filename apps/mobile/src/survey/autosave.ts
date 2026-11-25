/** Debounce a synchronous snapshot writer. A failed write remains pending until
 * the latest snapshot can be persisted or a newer synchronous commit succeeds.
 * Never schedule an obsolete snapshot after an explicit durable commit.
 */
export function createAutosave<T>(write: (snapshot: T) => void, onFailure: (failed: boolean) => void, delay = 300) {
 let pending: { snapshot: T } | undefined;
 let timer: ReturnType<typeof setTimeout> | undefined;
 const cancelTimer = () => {
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
 };
 const flush = (): boolean => {
  cancelTimer();
  if (!pending) return true;
  try {
   write(pending.snapshot);
  } catch {
   onFailure(true);
   return false;
  }
  pending = undefined;
  onFailure(false);
  return true;
 };
 return {
  schedule(snapshot: T) {
   pending = { snapshot };
   cancelTimer();
   timer = setTimeout(flush, delay);
  },
  flush,
  /** Call only after a newer explicit synchronous write has succeeded. */
  committed() {
   cancelTimer();
   pending = undefined;
   onFailure(false);
  },
  cancelTimer,
 };
}
