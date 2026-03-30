import { levelsSuite } from '../common/suites/levels.suite';
import { mixinsSuite } from '../common/suites/mixins.suite';
import { optionsSuite } from '../common/suites/options.suite';
import { prefixSuite } from '../common/suites/prefix.suite';
import { runSuite } from '../common/suites/runner';
import { scopesSuite } from '../common/suites/scopes.suite';
import { spinnersSuite } from '../common/suites/spinners.suite';
import { browserAdapter } from './adapter';

// Per D-04: browser adapter only — no browser worker adapter exists.
// formats.suite excluded: browser output is always CSS %c format strings;
// JSON.parse / parseLogfmt in formats suite would throw on '%c...' output.
runSuite(levelsSuite, browserAdapter);
runSuite(scopesSuite, browserAdapter);
runSuite(optionsSuite, browserAdapter);
runSuite(prefixSuite, browserAdapter);
runSuite(mixinsSuite, browserAdapter);
runSuite(spinnersSuite, browserAdapter);
