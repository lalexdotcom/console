/**
 * Captures all process.stdout.write and process.stderr.write calls during
 * callback execution. Returns { stdout, stderr } arrays of string chunks.
 * Synchronous — the logger's dispatch is synchronous.
 *
 * rstest audit (v3.0.0): No rstest 0.9.x builtin intercepts stream writes at
 * the process.stdout/stderr level. @rstest/core provides vi.spyOn for function
 * mocking but not low-level stream capture. This helper must be kept until
 * rstest exposes a stream-capture primitive.
 *
 * @param fn - Callback to execute while both streams are intercepted.
 * @returns Object with stdout and stderr arrays of captured string chunks.
 */
export function captureAll(fn: () => void): {
  stdout: string[];
  stderr: string[];
} {
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);

  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    out.push(
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
    );
    return true;
  }) as typeof process.stdout.write;

  process.stderr.write = ((chunk: string | Uint8Array): boolean => {
    err.push(
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
    );
    return true;
  }) as typeof process.stderr.write;

  try {
    fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }

  return { stdout: out, stderr: err };
}

/**
 * Async-safe stream capture: patches process.stdout.write and process.stderr.write,
 * awaits fn() (handles both sync and async callbacks), then restores.
 * Returns all captured output as normalised lines (split on \n, empty lines stripped).
 *
 * Required for battery adapters because spinners.suite exec() tests await an async
 * callback (SPIN-04). Synchronous captureAll() would not drain spinner state correctly.
 *
 * @param fn - Sync or async callback to execute while streams are intercepted.
 * @returns Array of non-empty lines from combined stdout/stderr output.
 */
export async function captureAsync(
  fn: () => void | Promise<void>,
): Promise<string[]> {
  const chunks: string[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);

  const intercept = (chunk: string | Uint8Array): boolean => {
    chunks.push(
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
    );
    return true;
  };

  process.stdout.write = intercept as typeof process.stdout.write;
  process.stderr.write = intercept as typeof process.stderr.write;

  try {
    await fn();
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }

  return chunks
    .join('\n')
    .split('\n')
    .filter((l) => l.trim().length > 0);
}
