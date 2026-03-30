import { afterEach } from '@rstest/core';
import { releaseWorker } from '../../src/worker/index';
import { levelsSuite } from '../common/suites/levels.suite';
import { mixinsSuite } from '../common/suites/mixins.suite';
import { optionsSuite } from '../common/suites/options.suite';
import { runSuite } from '../common/suites/runner';
import { ttyAdapter, ttyWorkerAdapter } from './adapter';

// Per D-04: ttyAdapter (main) and ttyWorkerAdapter (worker fallback) both run via
// runSuite's built-in parity — same pattern as console format dirs.
// 3 suites only, limited to those compatible with ANSI-prefixed TTY output:
//   formats excluded: TTY mode never produces raw json/logfmt
//   scopes/prefix excluded: call JSON.parse() — throws on ANSI TTY output
//   spinners excluded: assumes console-mode timing; TTY spinner in spinner-tty.test.ts
runSuite(levelsSuite, ttyAdapter, ttyWorkerAdapter);
runSuite(optionsSuite, ttyAdapter, ttyWorkerAdapter);
runSuite(mixinsSuite, ttyAdapter, ttyWorkerAdapter);

// Belt-and-suspenders fork cleanup — ttyWorkerAdapter.setup() already calls releaseWorker().
afterEach(() => {
  releaseWorker();
});
