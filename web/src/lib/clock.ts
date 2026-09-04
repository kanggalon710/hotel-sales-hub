/**
 * Request-time clock for server components.
 *
 * A server component renders exactly once per request, so reading the clock
 * there is deterministic for that render. Client components must not read it
 * during render; they receive `now` as a prop from the server instead.
 */
export function requestNow() {
  return Date.now();
}
