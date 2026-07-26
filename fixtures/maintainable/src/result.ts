export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

export function mapResult<T, U>(
  result: Result<T>,
  transform: (value: T) => U,
): Result<U> {
  if (!result.ok) return result;
  return { ok: true, value: transform(result.value) };
}

export function valueOr<T>(result: Result<T>, fallback: T): T {
  return result.ok ? result.value : fallback;
}
