/**
 * Structured result produced by TestAdapter.parse() for one intercepted output line.
 * All fields except raw are optional — parse() fills only what the format provides.
 */
export interface LogOutput {
  raw: string;
  level?: string;
  scope?: string;
  msg?: string;
  date?: string;
  caller?: string;
  badgeColor?: string;
  icon?: string;
  progress?: number;
  spinnerState?: 'running' | 'success' | 'fail' | 'stop';
}
