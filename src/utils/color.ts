/**
 * Maps a color name to its ANSI escape code(s).
 * A single number is a standard code; an array is an extended 256-color sequence (e.g. [38, 5, N]).
 */
type ColorRegistry = Record<string, number | number[]>;

/**
 * Named ANSI color palette for foreground and background.
 * All values ultimately resolve to one or more SGR parameters.
 */
export const STYLES = {
  color: {
    black: 30,
    grey: 90,
    white: [38, 5, 15],

    red: 31,
    green: 32,
    yellow: 93,
    orange: 33,
    blue: 94,
    dodgerblue: [38, 5, 33],
    cyan: 36,
    mediumpurple: [38, 5, 135],
  },
  'background-color': {
    black: 40,
    grey: [48, 5, 249],
    white: 107,

    red: [48, 5, 160],
    green: [48, 5, 40],
    yellow: [48, 5, 226],
    orange: [48, 5, 208],
    blue: [48, 5, 21],
    dodgerblue: [48, 5, 33],
    cyan: 46,
    mediumpurple: [48, 5, 135],
  },
} satisfies { color: ColorRegistry; 'background-color': ColorRegistry };

type Color = keyof (typeof STYLES)['color'];
type BackgroundColor = keyof (typeof STYLES)['background-color'];

/**
 * Wraps `text` in ANSI SGR escape sequences for the requested style.
 * Unknown color names are silently ignored (no styling applied).
 * Always resets styles after the text with `\u001B[0m`.
 *
 * @param text  The string to colorize.
 * @param style Optional foreground color and/or background color.
 * @returns The styled string, or the original `text` if no known style matched.
 */
export const colorize = (
  text: string,
  style?: {
    color?: Color | (string & {});
    'background-color'?:
      | keyof (typeof STYLES)['background-color']
      | (string & {});
  },
) => {
  const colors: number[] = [];
  if (style) {
    if (style.color && STYLES.color[style.color as Color]) {
      // Flatten to handle both single-code and extended-sequence entries
      colors.push(...[STYLES.color[style.color as Color]].flat());
    }
    if (
      style['background-color'] &&
      STYLES['background-color'][style['background-color'] as BackgroundColor]
    ) {
      colors.push(
        ...[
          STYLES['background-color'][
            style['background-color'] as BackgroundColor
          ],
        ].flat(),
      );
    }
    if (colors.length) {
      // \u001B[ … m  →  SGR sequence;  \u001B[0m  →  reset all attributes
      return `\u001B[${colors.join(';')}m${text}\u001B[0m`;
    }
  }
  return text;
};
