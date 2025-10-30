import os, { EOL } from 'node:os';
import process, { env } from 'node:process';
import type { WriteStream } from 'node:tty';
import {
	type InspectOptions,
	type inspect,
	stripVTControlCharacters,
} from 'node:util';
import { colorize } from './utils/color';

const inNode =
	typeof process !== 'undefined' &&
	process?.versions != null &&
	process?.versions?.node != null;
const inMainBrowser =
	typeof window !== 'undefined' && typeof window.document !== 'undefined';
const inWebWorker =
	typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope;
const inBrowser = inMainBrowser || inWebWorker;

const providedConsole = console;
let activeConsole = providedConsole;

let utilInspect: typeof inspect;
if (inNode) {
	try {
		utilInspect = require(`${'util'}`)?.inspect;
	} catch (e) {}
}

type LogParameters = Parameters<typeof console.log>;

type LogMethod = {
	(...args: LogParameters): void;
	spin: (
		message: string,
		options?: Omit<SpinnerOptions & { console?: true }, 'text'>,
	) => ProgressLogger;
};

const LEVEL_METHODS = {
	emerg: 0,
	alert: 1,
	crit: 2,
	error: 3,
	warn: 4,
	notice: 5,
	info: 6,
	verb: 7,
	debug: 8,
	wth: 9,
} as const;

export type LogLevel = keyof typeof LEVEL_METHODS;
export const LogLevels = Object.keys(LEVEL_METHODS) as LogLevel[];

type GenericLogger = {
	[key in keyof typeof LEVEL_METHODS]: LogMethod;
} & {
	log: (level: LogLevel, ...args: LogParameters) => void;
	getPrefix(level: LogLevel): string[];
};

type LoggerOptions = {
	enabled: boolean;
	stack: boolean;
	date: boolean;
	duration: boolean;
	level: LogLevel | undefined;
	pad: boolean;
	color: boolean;
	uid: boolean;

	inspect: InspectOptions;
};

const DEFAULT_INSPECT_OPTIONS: InspectOptions = {
	depth: 5,
	colors: true,
};

export interface Logger extends GenericLogger, LoggerOptions {
	exclusive: boolean;

	once(key?: string): GenericLogger;
	limit(count: number, key?: string): GenericLogger;
	limit(key: string): GenericLogger;
}

export interface RootLogger extends Logger {
	scope(scopeName: string, options?: Partial<LoggerOptions>): ScopeLogger;

	patch(): void;
	unpatch(): void;
}

export interface ScopeLogger extends Logger {
	readonly scope: string;
}

type LoggerRegistry = {
	root: RootLoggerInstance;
	scopes: { [key: string]: ScopeLoggerInstance | undefined };
	exclusive?: Logger;
};

const DEFAULT_LOGGER_OPTIONS: LoggerOptions = {
	enabled: true,
	level: undefined,

	stack: false,
	date: false,
	duration: false,
	pad: inNode && !!process.stdout?.isTTY,
	color: true,

	uid: false,

	inspect: DEFAULT_INSPECT_OPTIONS,
};

const outputLog = (
	logLevel: LogLevel,
	args: LogParameters,
	logger: LoggerBase,
	override?: { prefix?: string | string[] },
) => {
	try {
		// const scope = logger instanceof ScopeLoggerInstance ? logger.scope : undefined;
		if (!logger.enabled || !root.enabled || env.LLOGGER_ENABLED === 'false') {
			return;
		}
		if (registry.exclusive && registry.exclusive !== logger) return;

		const {
			date,
			duration: time,
			level,
			stack,
			inspect,
			uid,
		} = computeOptions(logger);

		if (!LEVEL_PARAMS[logLevel]) return;
		if (level && LEVEL_METHODS[level] < LEVEL_METHODS[logLevel]) return;
		const levelParams = LEVEL_PARAMS[logLevel];

		const logPrefix: string[] = override?.prefix
			? Array.isArray(override?.prefix)
				? override.prefix
				: [override.prefix]
			: inNode
				? [getNodePrefix(logLevel, logger)]
				: getBrowserPrefix(logLevel, logger);

		if (inWebWorker) {
			logPrefix.push('[*]');
		}
		if (time || date) {
			if (time) logger.lastLog ??= new Date().valueOf();
			const now: Date = new Date();
			if (date) {
				const datePrefix = getDatePrefix(now);
				logPrefix.push(datePrefix);
			}
			if (time) {
				const timePrefix = getDurationPrefix(
					now.valueOf() - (logger.lastLog ?? 0),
				);
				logger.lastLog = new Date().valueOf();
				logPrefix.push(timePrefix);
			}
		}
		if (stack) {
			const caller = getLogCallerInfo();
			let stackDisplay =
				caller?.functionName ||
				`${caller?.fileName?.split('/').slice(-1).join('/')}:${caller?.lineNumber}:${caller?.columnNumber}`;
			if (caller?.functionName && caller?.fileName)
				stackDisplay += ` @ ${caller?.fileName}:${caller?.lineNumber}:${caller?.columnNumber}`;
			if (stackDisplay) logPrefix.push(`(${stackDisplay})`);
		}

		let callArgs = args;
		if (inNode && utilInspect) {
			try {
				callArgs = args.map((a) =>
					typeof a === 'string'
						? a
						: utilInspect(a, inspect ?? DEFAULT_INSPECT_OPTIONS),
				);
			} catch (e) {}
		}
		if (uid) {
			callArgs = args.flatMap((a) => {
				if (typeof a === 'object' || typeof a === 'function') {
					let objectUID = UID_MAP.get(a);
					if (objectUID === undefined) {
						// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
						UID_MAP.set(a, (objectUID = ++CURRENT_UID));
					}
					return [{ _uid: `#${objectUID}` }, a];
				}
				return [a];
			});
		}
		if (isRefreshing()) {
			const outputString = [...logPrefix, ...callArgs]
				.map((a) => a.toString())
				.join(' ');
			addContentToBuffer(outputString);
		} else {
			levelParams.methods.map((method) =>
				method.apply(globalThis, [...logPrefix, ...callArgs]),
			);
		}
	} catch (e) {
		console.error(e instanceof Error ? e.message : JSON.stringify(e));
	}
};

abstract class LoggerBase implements Logger {
	options: LoggerOptions;
	lastLog?: number;

	private static createLogMethod = (
		logger: LoggerBase,
		level: LogLevel,
	): LogMethod => {
		const logFunction = (...args: LogParameters) =>
			logger.logAtLevel(level, ...args);
		logFunction.spin = (
			message: string,
			options?: Omit<SpinnerOptions & { console?: boolean }, 'text'> & {
				tty?: boolean;
			},
		): ProgressLogger => {
			let spinner: ProgressLogger;
			if (!options?.console && stdOut?.isTTY) {
				spinner = new TTYSpinner(logger, level, {
					...options,
					text: message,
				});
			} else {
				spinner = inNode
					? new NodeConsoleSpinner(logger, level, {
							duration: true,
							...options,
							text: message,
						})
					: new BrowserConsoleSpinner(logger, level, {
							duration: true,
							...options,
							text: message,
						});
			}
			spinner.start();
			return spinner;
		};
		return logFunction;
	};

	#limits: { [key: string]: GenericLogger } = {};

	#limitedProxy(count: number): GenericLogger {
		let proxyCount = 0;
		return new Proxy(this, {
			get(target, prop) {
				if (prop in LEVEL_METHODS && ++proxyCount > count) return () => {};
				const method = target[prop as keyof typeof target];
				return method;
			},
		});
	}

	readonly emerg!: LogMethod;
	readonly alert!: LogMethod;
	readonly crit!: LogMethod;
	readonly error!: LogMethod;
	readonly warn!: LogMethod;
	readonly notice!: LogMethod;
	readonly info!: LogMethod;
	readonly verb!: LogMethod;
	readonly debug!: LogMethod;
	readonly wth!: LogMethod;

	constructor(options: Partial<LoggerOptions> = {}) {
		this.options = { ...DEFAULT_LOGGER_OPTIONS, ...options };
		for (const [method, level] of Object.entries(LEVEL_METHODS)) {
			// ! Bad LAlex ! You should never do that
			this[method as LogLevel] = LoggerBase.createLogMethod(
				this,
				method as LogLevel,
			);
		}
	}

	once(key?: string): GenericLogger {
		return this.limit(1, key ?? getCallerLimitKey());
	}

	limit(key: string): GenericLogger;
	limit(count: number, key?: string): GenericLogger;
	limit(countOrKey: number | string, key?: string): GenericLogger {
		let callKey = key;
		if (typeof countOrKey === 'string') {
			if (!this.#limits[countOrKey]) {
				throw new Error('Limit ');
			}
			return this.#limits[countOrKey];
		}
		callKey ??= getCallerLimitKey();
		if (callKey === undefined) {
			throw new Error('Invalid key', callKey);
		}
		// biome-ignore lint/suspicious/noAssignInExpressions: <explanation>
		return (this.#limits[callKey] ??= this.#limitedProxy(countOrKey));
		// throw new Error("Method not implemented.");
	}

	protected logAtLevel(level: LogLevel, ...args: LogParameters) {
		return outputLog(level, args, this);
	}

	getPrefix(level: LogLevel) {
		return inNode
			? [getNodePrefix(level, this)]
			: getBrowserPrefix(level, this);
	}

	log(level: LogLevel, ...args: LogParameters): void {
		this.logAtLevel(level, ...args);
	}

	get exclusive() {
		return registry.exclusive === this;
	}

	set exclusive(b: boolean) {
		registry.exclusive = this.exclusive ? undefined : this;
	}

	protected setOption<K extends keyof LoggerOptions>(
		key: K,
		value: LoggerOptions[K],
	) {
		this.options[key] = value;
	}

	protected getOption<K extends keyof LoggerOptions>(key: K) {
		return this.options[key];
	}

	get enabled() {
		return this.getOption('enabled');
	}

	set enabled(b: boolean) {
		this.setOption('enabled', b);
	}

	get uid() {
		return this.getOption('uid');
	}

	set uid(b: boolean) {
		this.setOption('uid', b);
	}

	get stack() {
		return this.getOption('stack');
	}

	set stack(b: boolean) {
		this.setOption('stack', b);
	}

	get date() {
		return this.getOption('date');
	}

	set date(b: boolean) {
		this.setOption('date', b);
	}

	get duration() {
		return this.getOption('duration');
	}

	set duration(b: boolean) {
		this.setOption('duration', b);
	}

	get level() {
		return this.getOption('level');
	}

	set level(lvl: LogLevel | undefined) {
		this.setOption('level', lvl);
	}

	get pad() {
		return this.getOption('pad');
	}

	set pad(b: boolean) {
		this.setOption('pad', b);
	}

	set inspect(opts: InspectOptions) {
		this.setOption('inspect', { ...opts });
	}

	get inspect() {
		return { ...this.getOption('inspect') };
	}

	set color(b: boolean) {
		this.setOption('color', b);
	}

	get color() {
		return this.getOption('color');
	}
}

class RootLoggerInstance extends LoggerBase implements RootLogger {
	private static __originalMethods: Partial<
		Record<keyof typeof console, typeof console.log>
	> = {
		log: console.log,
		info: console.info,
		debug: console.debug,
		error: console.error,
		warn: console.warn,
	};

	private static __originalConsole: Console = console;

	scope(scopeName: string, options: Partial<LoggerOptions> = {}): ScopeLogger {
		let scopeLogger = registry.scopes[scopeName];
		scopeLogger ??= registry.scopes[scopeName] = new ScopeLoggerInstance(
			scopeName,
			this,
			options,
		);
		return scopeLogger;
	}

	patch() {
		console.log = console.info = this.info.bind(this);
		console.info = this.info.bind(this);
		console.debug = this.debug.bind(this);
		console.warn = this.warn.bind(this);
		console.error = this.crit.bind(this);
	}

	unpatch() {
		for (const k of Object.keys(RootLoggerInstance.__originalMethods)) {
			const method = k as keyof typeof console;
			// biome-ignore lint/suspicious/noExplicitAny: <explanation>
			if (method)
				console[method] = RootLoggerInstance.__originalMethods[method] as any;
		}
		// Object.keys(RootLoggerInstance.__originalMethods).forEach((k) => {});
	}
}

class ScopeLoggerInstance extends LoggerBase implements ScopeLogger {
	readonly scope: string;
	readonly parent: RootLogger;

	constructor(
		scope: string,
		root: RootLoggerInstance,
		options?: Partial<LoggerOptions>,
	) {
		super(options);
		this.scope = scope;
		this.parent = root;
	}
}

type LogLevelStyle = {
	'background-color'?: string;
	color?: string;
};

const DEFAULT_BROWSER_STYLE = {
	padding: '2px 4px',
	'border-radius': '2px',
};

type LogLevelParam = {
	label: string;
	paddedLabel?: string;
	methods: (typeof console.log)[];
	style?: Partial<LogLevelStyle>;
	css?: string;
};

const DEFAULT_LEVEL_STYLE: LogLevelStyle = {
	'background-color': 'grey',
	color: 'white',
};

const LEVEL_PARAMS: { [key in LogLevel]: LogLevelParam } = {
	emerg: {
		label: 'EMERGENCY',
		methods: [
			(...params) => activeConsole.error(...params),
			(...params) => activeConsole.trace(...params),
		],
		style: {
			'background-color': 'red',
		},
	},
	alert: {
		label: 'ALERT',
		methods: [
			(...params) => activeConsole.error(...params),
			(...params) => activeConsole.trace(...params),
		],
		style: {
			'background-color': 'red',
		},
	},
	crit: {
		label: 'CRITICAL',
		methods: [
			(...params) => activeConsole.error(...params),
			(...params) => activeConsole.trace(...params),
		],
		style: {
			'background-color': 'red',
		},
	},
	error: {
		label: 'ERROR',
		methods: [(...params) => activeConsole.error(...params)],
		style: {
			'background-color': 'red',
		},
	},
	warn: {
		label: 'WARNING',
		methods: [(...params) => activeConsole.warn(...params)],
		style: {
			color: 'white',
			'background-color': 'orange',
		},
	},
	notice: {
		label: 'NOTICE',
		methods: [(...params) => activeConsole.info(...params)],
		style: {
			'background-color': 'blue',
		},
	},
	info: {
		label: 'INFO',
		methods: [(...params) => activeConsole.info(...params)],
	},
	verb: {
		label: 'VERBOSE',
		methods: [(...params) => activeConsole.debug(...params)],
		style: {
			'background-color': 'green',
		},
	},
	debug: {
		label: 'DEBUG',
		methods: [(...params) => activeConsole.debug(...params)],
		style: {
			'background-color': 'yellow',
			color: 'black',
		},
	},
	wth: {
		label: 'WHO CARES?',
		methods: [(...params) => activeConsole.debug(...params)],
		style: {
			'background-color': 'lightgray',
			color: 'black',
		},
	},
};

if (inNode) {
	const padSize = Math.max(
		...Object.values(LEVEL_PARAMS).map((info) => info.label.length),
	);
	for (const lvl of Object.values(LEVEL_PARAMS)) {
		lvl.paddedLabel = lvl.label
			.padEnd(lvl.label.length + (padSize - lvl.label.length) / 2, ' ')
			.padStart(padSize, ' ');
	}
}
for (const lvl of Object.values(LEVEL_PARAMS)) {
	lvl.style = { ...DEFAULT_LEVEL_STYLE, ...lvl.style };
	if (inBrowser) {
		lvl.css = css(lvl.style);
	}
}

function css(style: Partial<LogLevelStyle>) {
	const cssObject: Record<string, unknown> = {
		...DEFAULT_BROWSER_STYLE,
		...style,
	};

	return Object.entries(cssObject)
		.map(([key, value]) => `${key}: ${value}`)
		.join(';');
}

const computeOptions = (logger: LoggerBase) => {
	const computed = { ...logger.options };
	const root = registry.root;
	for (const [key, value] of Object.entries(computed)) {
		switch (key) {
			case 'level':
				computed[key] =
					root.level === undefined
						? computed.level
						: computed.level === undefined
							? root.level
							: LEVEL_METHODS[root.level] < LEVEL_METHODS[computed.level]
								? root.level
								: computed.level;
				break;
			case 'date':
			case 'duration':
			case 'pad':
			case 'stack':
				computed[key] ||= root[key];
				break;
			case 'color':
				computed[key] &&= root[key];
				break;
			case 'inspect':
				computed[key] = { ...root.options[key], ...computed[key] };
				break;
		}
	}
	return computed;
};

const getNodePrefix = (logLevel: LogLevel, logger: LoggerBase) => {
	const { pad, color } = computeOptions(logger);
	const levelParams = LEVEL_PARAMS[logLevel];
	let levelPrefix = (pad && levelParams.paddedLabel) || levelParams.label;
	const scope =
		logger instanceof ScopeLoggerInstance ? logger.scope : undefined;
	if (scope) levelPrefix += ` <${scope}>`;
	if (inNode) {
		if (color) {
			return colorize(` ${levelPrefix} `, levelParams.style);
		}
		return `[${levelPrefix}]`;
	}
	return '';
};

const getBrowserPrefix = (logLevel: LogLevel, logger: LoggerBase) => {
	const { color, pad } = computeOptions(logger);
	const levelParams = LEVEL_PARAMS[logLevel];
	let levelPrefix = (pad && levelParams.paddedLabel) || levelParams.label;
	const scope =
		logger instanceof ScopeLoggerInstance ? logger.scope : undefined;
	if (scope) levelPrefix += ` <${scope}>`;
	return color && levelParams.css
		? [`%c${levelPrefix}`, levelParams.css]
		: [`[${levelPrefix}]`];
};

let CURRENT_UID = 0;
const UID_MAP = new Map<unknown, typeof CURRENT_UID>();

function getDatePrefix(date: Date) {
	return `[${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')} ${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}:${`${date.getSeconds()}`.padStart(2, '0')}.${`${(date.getMilliseconds() / 1000).toFixed(3).slice(2, 5)}`.padStart(2, '0')}]`;
}

function getDurationPrefix(durationMs: number): string;
function getDurationPrefix(since: Date, to?: Date): string;
function getDurationPrefix(sinceOrDurationMs: Date | number, to?: Date) {
	const duration =
		typeof sinceOrDurationMs === 'number'
			? sinceOrDurationMs
			: (to ?? new Date()).valueOf() - sinceOrDurationMs.valueOf();
	return `[+${(duration / 1000).toFixed(3)}s]`;
}

('            ');

const getCallerLimitKey = () => getCallerStack(4);
const getLogCallerInfo = ():
	| {
			functionName?: string;
			fileName?: string;
			columnNumber?: string;
			lineNumber?: string;
	  }
	| undefined => {
	const stack = getCallerStack(6);
	if (stack) {
		return inNode
			? stack.match(
					/at (?<fileName>.*):(?<lineNumber>[0-9]*):(?<columnNumber>[0-9]*)/,
				)?.groups
			: stack.match(
					/at (?<functionName>.*) \(?(?<fileName>.*):(?<lineNumber>[0-9]*):(?<columnNumber>[0-9]*)\)/,
				)?.groups;
	}
};

const getCallerStack = (level: number): string | undefined => {
	let err: Error;
	try {
		throw new Error();
	} catch (e) {
		err = e as Error;
	}
	const stack = err.stack?.split('\n') || [];
	return stack.slice(level)[0];
};

const registry = (() => {
	if (typeof globalThis === 'undefined') throw new Error('No globalThis found');
	const anyGlobal = globalThis as Record<string, unknown>;
	const registryName = '$logger-registry';
	if (!anyGlobal[registryName]) {
		const emptyRegistry: LoggerRegistry = {
			root: new RootLoggerInstance(),
			scopes: {},
		};
		anyGlobal[registryName] = emptyRegistry;
	}
	return anyGlobal[registryName] as LoggerRegistry;
})();

const root = registry.root;

export const Logger: RootLogger = root;
export const L = Logger;

// Spinner

export interface ProgressLogger {
	start(): void;
	update(text: string): void;
	success(text?: string): void;
	fail(text?: string): void;
	stop(): void;
}

type SpinnerOptions = {
	text: string;
	prefix?: string;
	runningIcon?: string;
	successIcon?: string;
	failIcon?: string;
	date?: boolean;
	duration?: boolean;
};

const CONSOLE_SPINNER_TIMEOUT = 10_000;
const DEFAULT_CONSOLE_RUNNING_ICON = '-';
const DEFAULT_CONSOLE_FAIL_ICON = '✖';
const DEFAULT_CONSOLE_SUCCESS_ICON = '✔';

abstract class AbstractConsoleSpinner<
	OptionsType extends SpinnerOptions = SpinnerOptions,
> {
	private prefix?: string | false;
	protected text = '';

	protected icon?: string;
	protected iteration = 0;

	protected logger: LoggerBase;
	protected level: LogLevel;

	// private _loggerOptions: LoggerOptions;

	protected started?: Date;
	protected stopped?: Date;

	protected options: Omit<OptionsType, 'text'>;

	private nextTimeout?: ReturnType<typeof setTimeout>;

	constructor(logger: LoggerBase, level: LogLevel, options: OptionsType) {
		this.logger = logger;
		this.level = level;
		// this._loggerOptions = { ...computeOptions(logger) };
		const { text, ...spinOptions } = options ?? ({} as OptionsType);
		this.options = { ...spinOptions };
		this.icon = spinOptions.runningIcon ?? DEFAULT_CONSOLE_RUNNING_ICON;
		this.setText(text ?? '');
	}

	setText(text: string) {
		this.text = text;
	}

	start() {
		if (!this.started) {
			this.started = new Date();
			this.iteration = 1;
			this.tick();
		}
	}

	update(text: string) {
		this.setText(text);
	}

	success(text?: string) {
		if (text !== undefined) this.setText(text);
		this.icon = this.options.successIcon ?? DEFAULT_CONSOLE_SUCCESS_ICON;
		this.stop();
	}

	fail(text?: string) {
		if (text !== undefined) this.setText(text);
		this.icon = this.options.failIcon ?? DEFAULT_CONSOLE_FAIL_ICON;
		this.stop();
	}

	stop() {
		if (this.nextTimeout) clearTimeout(this.nextTimeout);
		this.stopped = new Date();
		this.tick();
	}

	tick() {
		this.display();
		if (this.started && !this.stopped) {
			if (!this.nextTimeout) {
				this.nextTimeout = setTimeout(() => {
					this.iteration++;
					this.nextTimeout = undefined;
					clearTimeout(this.nextTimeout);
					this.tick();
				}, CONSOLE_SPINNER_TIMEOUT);
			}
		}
	}

	abstract display(): void;
}

class NodeConsoleSpinner
	extends AbstractConsoleSpinner
	implements ProgressLogger
{
	constructor(logger: LoggerBase, level: LogLevel, options: SpinnerOptions) {
		super(logger, level, {
			...options,
			runningIcon:
				options.runningIcon ??
				colorize(` ${DEFAULT_CONSOLE_RUNNING_ICON} `, {
					color: 'black',
					'background-color': 'grey',
				}),
			failIcon:
				options.failIcon ??
				colorize(` ${DEFAULT_CONSOLE_FAIL_ICON} `, {
					color: 'white',
					'background-color': 'red',
				}),
			successIcon:
				options.successIcon ??
				colorize(` ${DEFAULT_CONSOLE_SUCCESS_ICON} `, {
					color: 'white',
					'background-color': 'green',
				}),
		});
	}

	display() {
		const texts = [this.text];
		if (this.options.duration && this.started) {
			texts.unshift(`[${getDurationPrefix(this.started, this.stopped)}]`);
		} else {
			if (!this.stopped) texts.push(''.padStart(this.iteration, '.'));
		}

		outputLog(this.level, texts, this.logger, {
			prefix: [...this.logger.getPrefix(this.level), this.icon ?? ''],
		});
	}
}

type BrowserConsoleSpinnerOptions = SpinnerOptions & {
	successStyle?: string;
	failStyle?: string;
	runningStyle?: string;
};

const DEFAULT_BROWSER_RUNNING_STYLE = {
	'background-color': 'grey',
	color: 'white',
};
const DEFAULT_BROWSER_FAIL_STYLE = {
	'background-color': 'red',
	color: 'white',
};
const DEFAULT_BROWSER_SUCCESS_STYLE = {
	'background-color': 'green',
	color: 'white',
};
class BrowserConsoleSpinner
	extends AbstractConsoleSpinner<BrowserConsoleSpinnerOptions>
	implements ProgressLogger
{
	private style: string;

	static styleToCss = (style: object) => {
		return Object.keys({ ...DEFAULT_BROWSER_STYLE, ...style })
			.map(([k, v]) => `${k}: ${v}`)
			.join('; ');
	};

	constructor(
		logger: LoggerBase,
		level: LogLevel,
		options: BrowserConsoleSpinnerOptions,
	) {
		super(logger, level, options);
		this.style = css(DEFAULT_BROWSER_RUNNING_STYLE);
	}

	success(text?: string): void {
		this.style =
			this.options.successStyle ?? css(DEFAULT_BROWSER_SUCCESS_STYLE);
		super.success(text);
	}

	fail(text?: string): void {
		this.style = this.options.failStyle ?? css(DEFAULT_BROWSER_FAIL_STYLE);
		super.fail(text);
	}

	display() {
		const [pfx, color1] = this.logger.getPrefix(this.level);
		const texts = [this.text];
		if (this.options.duration && this.started) {
			texts.unshift(`[${getDurationPrefix(this.started, this.stopped)}]`);
		} else {
			if (!this.stopped) texts.push(''.padStart(this.iteration, '.'));
		}
		outputLog(this.level, texts, this.logger, {
			prefix: [
				`${pfx}%c %c${this.icon}`,
				color1,
				'background-color: unset; color: unset',
				this.style,
			],
		});
	}
}

const DEFAULT_TTY_SPINNER = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
	.split('')
	.map((s) => colorize(s, { color: 'cyan' }) ?? s)
	.join('||');
const DEFAULT_TTY_SUCCESS_ICON = colorize('✔', { color: 'green' }) ?? '✔';
const DEFAULT_TTY_FAIL_ICON = colorize('✖', { color: 'red' }) ?? '✖';

type TTYSpinnerOptions = SpinnerOptions;

class TTYSpinner implements ProgressLogger {
	private _prefix?: string | false;
	private _text = '';

	private _iconIndex!: number;
	private _icon!: string | string[] | null;

	private _logger: LoggerBase;
	private _level: LogLevel;

	// private _loggerOptions: LoggerOptions;

	$started?: Date;
	$stopped?: Date;

	private options: TTYSpinnerOptions;

	constructor(logger: LoggerBase, level: LogLevel, options: TTYSpinnerOptions) {
		this._logger = logger;
		this._level = level;
		// this._loggerOptions = { ...computeOptions(logger) };
		this.options = options;
		this._prefix = this.options.prefix;
		this.setText(this.options.text);
		this.icon = (this.options.runningIcon ?? DEFAULT_TTY_SPINNER).split('||');

		this.start();
	}

	setText(text: string) {
		this._text = text;
	}

	set icon(icon: string | string[] | null) {
		this._icon = icon;
		this._iconIndex = 0;
	}

	get icon(): string | string[] | null {
		return this._icon;
	}

	start() {
		if (!root.enabled || !this._logger.enabled) return;
		if (!this.$started) {
			this.$started = new Date();
			runningSpinners.add(this);
			if (!isRefreshing()) startRefresh();
			if (!isRefreshing())
				this._logger.log(this._level, ...this.toString(false));
		}
	}

	update(text: string) {
		this.setText(text);
	}

	success(text?: string) {
		if (text !== undefined) this.setText(text);
		this.icon = this.options.successIcon ?? DEFAULT_TTY_SUCCESS_ICON;
		this.stop();
	}

	fail(text?: string) {
		if (text !== undefined) this.setText(text);
		this.icon = this.options.failIcon ?? DEFAULT_TTY_FAIL_ICON;
		this.stop();
	}

	stop() {
		if (!this.$stopped && !!this.$started) {
			this.$stopped = new Date();
			runningSpinners.delete(this);
			addContentToBuffer(this.toString());
			if (!isRefreshing()) {
				this._logger.log(this._level, this.toString(false));
			} else if (!runningSpinners.size) {
				stopRefreshTTY();
			}
		}
	}

	spin() {
		if (
			this.$started &&
			!this.$stopped &&
			this._icon &&
			this._icon.length > 1
		) {
			this._iconIndex++;
			if (this._iconIndex >= this._icon.length) this._iconIndex = 0;
		}
	}

	toString(withLevelPrefix?: boolean) {
		let textString = '';
		if (this._prefix !== false) {
			if (withLevelPrefix ?? true)
				textString += `${this._logger.getPrefix(this._level).join(' ')} `;
			if (this._prefix) textString += `${this._prefix} `;
		}
		if (this.options.date && this.$started) {
			textString += `${getDatePrefix(this.$started)} `;
		}
		if (this.options.duration && this.$started) {
			textString += `${getDurationPrefix(this.$started, this.$stopped)} `;
		}
		if (Array.isArray(this._icon)) {
			if (this._icon?.[this._iconIndex]) {
				textString += `${this._icon?.[this._iconIndex]} `;
			}
		} else if (this._icon !== null) {
			textString += `${this._icon} `;
		}
		textString += this._text;
		return textString;
	}
}

const runningSpinners: Set<ProgressLogger> = new Set();
let spinnersRefreshInterval: ReturnType<typeof setInterval> | undefined;
let ttyRefreshInterval: ReturnType<typeof setInterval> | undefined;

const stdOut: WriteStream = process?.stdout;
// const originalStdout = stdOut.write.bind(stdOut);

// const originalStderrWrite = process?.stderr.write.bind(process?.stderr);

// function restoreStderr() {
// 	if (process?.stderr) {
// 		process.stderr.write = originalStderrWrite;
// 	}
// }

// function redirectStderr() {
// 	if (process?.stderr) {
// 		process.stderr.write = process.stdout.write.bind(process.stdout);
// 	}
// }
// const buffer: { content: string; height: number }[] = [];
const newBuffered: string[] = [];
let currentBufferHeight = 0;

function getContentHeight(str: string) {
	const width = stdOut.columns;
	const lines = stripVTControlCharacters(str).split('\n');
	let height = 0;
	for (const line of lines) {
		height += Math.max(1, Math.ceil(line.length / width));
	}
	return height;
}

function isRefreshing() {
	return spinnersRefreshInterval !== undefined;
}

function addContentToBuffer(str: string) {
	const tabbed = str.replaceAll('\t', '   ');
	newBuffered.push(tabbed);
}

const SPINNER_REFRESH_INTERVAL = 80;
const TTY_REFRESH_INTERVAL = SPINNER_REFRESH_INTERVAL;

function startRefresh() {
	if (!isRefreshing() && stdOut?.isTTY) {
		stdOut.write('\u001B[?25l');
		stdOut.on('resize', handleTerminalResize);
		spinnersRefreshInterval = setInterval(() => {
			for (const s of runningSpinners) {
				if (s instanceof TTYSpinner) s.spin();
			}
			refreshTTY();
		}, SPINNER_REFRESH_INTERVAL);
		ttyRefreshInterval = setInterval(() => refreshTTY(), TTY_REFRESH_INTERVAL);
		refreshTTY();
	}
}

function handleTerminalResize() {
	currentBufferHeight = 0;
	for (const spinner of [...runningSpinners]) {
		currentBufferHeight += getContentHeight(spinner.toString());
	}
	refreshTTY();
}

function clearTTY() {
	// Clear displayed buffer
	stdOut.cursorTo(0);

	for (let index = 0; index < currentBufferHeight; index++) {
		if (index > 0) stdOut.moveCursor(0, -1);
		stdOut.clearLine(1);
	}

	currentBufferHeight = 0;
}

function stopRefreshTTY() {
	if (isRefreshing()) {
		refreshTTY();
		stdOut.write(os?.EOL);
		stdOut.write('\u001B[?25h');

		stdOut.off('resize', handleTerminalResize);

		clearInterval(spinnersRefreshInterval);
		spinnersRefreshInterval = undefined;

		clearInterval(ttyRefreshInterval);
		ttyRefreshInterval = undefined;

		currentBufferHeight = 0;
	}
}

function refreshTTY() {
	if (!isRefreshing()) return;

	clearTTY();

	// Write buffer and update height
	stdOut.write(
		newBuffered
			.concat(
				// Display running spinners at the end
				[...runningSpinners]
					.filter((sp) => sp instanceof TTYSpinner)
					.map((sp) => {
						const spinnerContent = sp.toString();
						currentBufferHeight += getContentHeight(spinnerContent);
						return spinnerContent;
					}),
			)
			.join(EOL),
	);
	newBuffered.length = 0;
	// computeBufferHeight();
}
