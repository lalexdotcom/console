import { L, type Logger } from '../logger';

export type ExecOptions = {
	label?: string;
	progressLabel?: (label: string) => string;
	completeLabel?: (label: string) => string;
	logger?: Logger;
	debug?: boolean | string;
};

const DEFAULT_EXEC_OPTIONS = {
	label: 'Action',
	progressLabel: (label: string) => `${label}`,
	completeLabel: (label: string) => `${label}`,
};

// const LGR = L.scope('exec');

export async function exec<T>(
	promiseOrFactory: Promise<T> | (() => Promise<T>),
	label?: ExecOptions['label'],
	options?: Omit<ExecOptions, 'label'>,
) {
	const promiseGenerator = typeof promiseOrFactory === 'function' ? promiseOrFactory : () => promiseOrFactory;
	if (!(options?.debug ?? true)) return promiseGenerator();
	const spinner = (options?.logger ?? L.scope(typeof options?.debug === 'string' ? options.debug : 'exec')).verb.spin(
		label ?? `Start ${label}`,
		{ duration: true },
	);
	const progressInterval = setInterval(() =>
		spinner.update((options?.progressLabel ?? DEFAULT_EXEC_OPTIONS.progressLabel)(label ?? DEFAULT_EXEC_OPTIONS.label)),
	);
	const res = await promiseGenerator()
		.then((res) => {
			clearInterval(progressInterval);
			spinner.success(
				(options?.completeLabel ?? options?.progressLabel ?? DEFAULT_EXEC_OPTIONS.progressLabel)(
					label ?? DEFAULT_EXEC_OPTIONS.label,
				),
			);
			return res;
		})
		.catch(async (e) => {
			clearInterval(progressInterval);
			spinner.fail(
				e instanceof Error
					? `${label ?? DEFAULT_EXEC_OPTIONS.label} failed (${e.stack})`
					: `${label ?? DEFAULT_EXEC_OPTIONS.label} failed`,
			);
			// await new Promise((res) => setTimeout(res, 5000));
			throw e;
		});
	return res;
}
