export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: never } : { data: T }))
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function ok<T>(data: T): ActionResult<T>;
export function ok(): ActionResult;
export function ok(data?: unknown) {
  return { ok: true, data } as never;
}

export function fail(error: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, fieldErrors };
}

/** Turns a thrown AccessError or unexpected failure into a message the UI can render. */
export function failFrom(err: unknown, fallback = 'Something went wrong. Please try again.') {
  if (err instanceof Error && err.name === 'AccessError') return fail(err.message);
  console.error('[action]', err);
  return fail(fallback);
}
