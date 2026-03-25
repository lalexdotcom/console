import { colorize } from '../../utils/color';
import { getDatePrefix } from './index';
import type { Prefix } from './types';

// ── Icon CSS helper ───────────────────────────────────────────────────────────

/** Builds the CSS for a circular icon badge in browser devtools. */
function buildIconBadgeCss(color?: string): string {
  const bgPart = color ? `background-color:${color};` : '';
  return `${bgPart}border-radius:50%;color:white;font-weight:bold;padding:0px 3px;aspect-ratio:1/1;font-size:0.875em;`;
}

// ── renderBrowserPrefix ───────────────────────────────────────────────────────

/**
 * Renders prefix items for browser devtools.
 * Returns `[formatString, ...cssArgs]` when styled, or `['plain text']` otherwise.
 * The result is spread as leading args to `console.log`.
 */
export function renderBrowserPrefix(items: Prefix[], color: boolean): string[] {
  if (items.length === 0) return [];
  let format = '';
  const cssArgs: string[] = [];
  let first = true;

  for (const item of items) {
    const sep = first ? '' : ' ';
    first = false;

    if (item.type === 'text') {
      if (color && item.css) {
        format += item.badge
          ? `${sep}%c[${item.text}]%c`
          : `${sep}%c${item.text}%c`;
        cssArgs.push(item.css, '');
      } else {
        format += item.badge ? `${sep}[${item.text}]` : `${sep}${item.text}`;
      }
    } else if (item.type === 'level') {
      const text = item.scope ? `${item.label} <${item.scope}>` : item.label;
      if (color && item.css) {
        format += `${sep}%c${text}%c`;
        cssArgs.push(item.css, '');
      } else {
        format += `${sep}[${text}]`;
      }
    } else if (item.type === 'icon') {
      if (color && item.color) {
        format += `${sep}%c${item.text}%c`;
        cssArgs.push(buildIconBadgeCss(item.color), '');
      } else {
        format += `${sep}[ ${item.text} ]`;
      }
    } else if (item.type === 'date') {
      format += `${sep}${getDatePrefix(new Date(item.ts ?? Date.now()))}`;
    } else if (item.type === 'caller') {
      // structuredOnly items are reserved for JSON/logfmt serialisation —
      // they would be redundant in pretty mode where a full stack trace follows.
      if (!item.structuredOnly) format += `${sep}(${item.value})`;
    }
  }

  return cssArgs.length > 0 ? [format, ...cssArgs] : [format];
}

// ── renderTTYPrefix ───────────────────────────────────────────────────────────

/**
 * Renders prefix items for TTY (ANSI colors, joined by spaces).
 */
export function renderTTYPrefix(items: Prefix[], color: boolean): string {
  return items
    .map((item) => {
      if (item.type === 'level') {
        const text = item.scope ? `${item.label} <${item.scope}>` : item.label;
        return color && item.style
          ? (colorize(` ${text} `, item.style) ?? `[${text}]`)
          : `[${text}]`;
      }
      if (item.type === 'text') {
        if (item.badge) {
          return color && item.style
            ? (colorize(` ${item.text} `, item.style) ?? `[${item.text}]`)
            : `[${item.text}]`;
        }
        return item.text;
      }
      if (item.type === 'icon') {
        const text =
          color && item.color
            ? (colorize(item.text, { color: item.color }) ?? item.text)
            : item.text;
        return `[ ${text} ]`;
      }
      if (item.type === 'date')
        return getDatePrefix(new Date(item.ts ?? Date.now()));
      // structuredOnly items are reserved for JSON/logfmt serialisation —
      // they would be redundant in pretty mode where a full stack trace follows.
      if (item.type === 'caller')
        return item.structuredOnly ? null : `(${item.value})`;
      return null;
    })
    .filter((s): s is string => s !== null)
    .join(' ');
}

// ── renderConsolePrefix ───────────────────────────────────────────────────────

/**
 * Renders prefix items for non-TTY node (piped output, CI).
 * Returns a plain-text string without ANSI codes.
 */
export function renderConsolePrefix(items: Prefix[]): string {
  return items
    .map((item) => {
      if (item.type === 'level') {
        const text = item.scope ? `${item.label} <${item.scope}>` : item.label;
        return `[${text}]`;
      }
      if (item.type === 'text')
        return item.badge ? `[${item.text}]` : item.text;
      if (item.type === 'icon') return `[ ${item.text} ]`;
      if (item.type === 'date')
        return getDatePrefix(new Date(item.ts ?? Date.now()));
      // structuredOnly items are reserved for JSON/logfmt serialisation —
      // they would be redundant in pretty mode where a full stack trace follows.
      if (item.type === 'caller')
        return item.structuredOnly ? null : `(${item.value})`;
      return null;
    })
    .filter((s): s is string => s !== null)
    .join(' ');
}
