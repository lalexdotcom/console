/**
 * Captures all process.stdout.write calls during callback execution.
 * Returns an array of written string chunks. Synchronous — the logger's
 * dispatch is synchronous.
 *
 * @param fn - Callback to execute while stdout is intercepted.
 * @returns Array of string chunks written to stdout during fn().
 */
export function captureStdout(fn: () => void): string[] {
  const chunks: string[] = [];
  const original = process.stdout.write.bind(process.stdout);

  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    chunks.push(
      typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk),
    );
    return true;
  }) as typeof process.stdout.write;

  try {
    fn();
  } finally {
    process.stdout.write = original;
  }

  return chunks;
}
