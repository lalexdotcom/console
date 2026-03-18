import type { LogParameters } from '../types';
import type { Prefix } from './types';

// ── Field extraction ──────────────────────────────────────────────────────────

type ExtractedFields = {
  level: string;
  severity: string;
  scope?: string;
  time: string;
  caller?: string;
  progress?: number | { done: number; total: number };
  msg: string;
  data?: unknown;
};

function extractFields(items: Prefix[], callArgs: LogParameters): ExtractedFields {
  let level = '';
  let severity = '';
  let scope: string | undefined;
  let caller: string | undefined;
  let progress: number | { done: number; total: number } | undefined;

  for (const item of items) {
    if (item.type === 'level') {
      level = item.channel;
      severity = item.severity;
      scope = item.scope;
    } else if (item.type === 'caller') {
      caller = item.value;
    } else if (item.type === 'progress') {
      progress = item.value;
    }
  }

  const time = new Date().toISOString();

  const [first, ...rest] = callArgs;
  let msg: string;
  let data: unknown;

  if (typeof first !== 'object' || first === null) {
    // First arg is a scalar — becomes the message
    msg = String(first ?? '');
    if (rest.length === 1) data = rest[0];
    else if (rest.length > 1) data = rest;
  } else {
    // First arg is an object — no message
    msg = '';
    if (callArgs.length === 1) data = first;
    else data = [...callArgs];
  }

  return { level, severity, scope, time, caller, progress, msg, data };
}

// ── Serializers ───────────────────────────────────────────────────────────────

export function serializeJSON(items: Prefix[], callArgs: LogParameters): string {
  const { level, severity, scope, time, caller, progress, msg, data } = extractFields(items, callArgs);
  const obj: Record<string, unknown> = {};
  obj.time = time;
  obj.level = level;
  obj.severity = severity;
  if (scope !== undefined) obj.scope = scope;
  if (caller !== undefined) obj.caller = caller;
  if (progress !== undefined) obj.progress = progress;
  obj.msg = msg;
  if (data !== undefined) obj.data = data;
  return JSON.stringify(obj);
}

export function serializeLogfmt(items: Prefix[], callArgs: LogParameters): string {
  const { level, severity, scope, time, caller, progress, msg, data } = extractFields(items, callArgs);
  const parts: string[] = [];
  parts.push(`time=${JSON.stringify(time)}`);
  parts.push(`level=${level}`);
  parts.push(`severity=${severity}`);
  if (scope !== undefined) parts.push(`scope=${scope}`);
  if (caller !== undefined) parts.push(`caller=${JSON.stringify(caller)}`);
  if (progress !== undefined) parts.push(`progress=${JSON.stringify(progress)}`);
  parts.push(`msg=${JSON.stringify(msg)}`);
  if (data !== undefined) parts.push(`data=${JSON.stringify(typeof data === 'string' ? data : JSON.stringify(data))}`);
  return parts.join(' ');
}
