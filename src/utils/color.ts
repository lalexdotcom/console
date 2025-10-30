type ColorRegistry = Record<string, number | number[]>;

export const STYLES = {
	color: {
		black: 30,
		grey: 100,
		white: [38, 5, 15],

		red: 31,
		green: 32,
		yellow: 93,
		orange: 33,
		blue: 94,
		cyan: 36,
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
		cyan: 46,
	},
} satisfies { color: ColorRegistry; 'background-color': ColorRegistry };

type Color = keyof (typeof STYLES)['color'];
type BackgroundColor = keyof (typeof STYLES)['background-color'];

export const colorize = (
	text: string,
	style?: {
		color?: Color | (string & {});
		'background-color'?: keyof (typeof STYLES)['background-color'] | (string & {});
	},
) => {
	const colors: number[] = [];
	if (style) {
		if (style.color && STYLES.color[style.color as Color]) {
			colors.push(...[STYLES.color[style.color as Color]].flat());
		}
		if (style['background-color'] && STYLES['background-color'][style['background-color'] as BackgroundColor]) {
			colors.push(...[STYLES['background-color'][style['background-color'] as BackgroundColor]].flat());
		}
		if (colors.length) {
			return `\u001B[${colors.join(';')}m${text}\u001B[0m`;
		}
	}
	return text;
};
