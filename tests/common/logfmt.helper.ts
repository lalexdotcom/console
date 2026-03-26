/**
 * Parses a single logfmt line into a key/value record.
 * Handles both bare values (level=info) and JSON-quoted values (msg="hello world").
 * Uses JSON.parse to correctly unescape quoted values.
 *
 * @param line - A single logfmt line, e.g. `time="..." level=info severity=info msg="hello"`
 * @returns Record mapping each key to its unescaped string value.
 */
export function parseLogfmt(line: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Match key=value or key="quoted value with possible spaces and escapes"
  const re = /(\w+)=("(?:[^"\\]|\\.)*"|[^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(line)) !== null) {
    const key = match[1];
    const raw = match[2];
    // Strip surrounding quotes and unescape via JSON.parse for quoted values
    result[key] = raw.startsWith('"') ? (JSON.parse(raw) as string) : raw;
  }
  return result;
}
