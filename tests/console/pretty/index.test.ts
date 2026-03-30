import { afterEach } from '@rstest/core';
import { releaseWorker } from '../../../src/worker/index';
import { formatsSuite } from '../../common/suites/formats.suite';
import { levelsSuite } from '../../common/suites/levels.suite';
import { mixinsSuite } from '../../common/suites/mixins.suite';
import { optionsSuite } from '../../common/suites/options.suite';
import { prefixSuite } from '../../common/suites/prefix.suite';
import { runSuite } from '../../common/suites/runner';
import { scopesSuite } from '../../common/suites/scopes.suite';
import { spinnersSuite } from '../../common/suites/spinners.suite';
import { mainAdapter, workerAdapter } from './adapter';

// Per D-03: all 7 suites run against both mainAdapter (direct stream capture) and
// workerAdapter (releaseWorker() fallback). runSuite re-runs each TestCase against
// workerAdapter when parity !== false (default), demonstrating structural API parity.
runSuite(levelsSuite, mainAdapter, workerAdapter);
runSuite(formatsSuite, mainAdapter, workerAdapter);
runSuite(scopesSuite, mainAdapter, workerAdapter);
runSuite(optionsSuite, mainAdapter, workerAdapter);
runSuite(prefixSuite, mainAdapter, workerAdapter);
runSuite(mixinsSuite, mainAdapter, workerAdapter);
runSuite(spinnersSuite, mainAdapter, workerAdapter);

// Belt-and-suspenders fork cleanup — workerAdapter.setup() already calls releaseWorker()
// in each test's beforeEach. This afterEach ensures cleanup on unexpected failures.
afterEach(() => {
  releaseWorker();
});
