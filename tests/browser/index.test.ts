import { levelsSuite } from '../common/suites/levels.suite';
import { mixinsSuite } from '../common/suites/mixins.suite';
import { optionsSuite } from '../common/suites/options.suite';
import { prefixSuite } from '../common/suites/prefix.suite';
import { runSuite } from '../common/suites/runner';
import { scopesSuite } from '../common/suites/scopes.suite';
import { spinnersSuite } from '../common/suites/spinners.suite';
import { browserAdapter } from './adapter';

// Per D-04: browser adapter only — no browser worker adapter exists.
runSuite(levelsSuite, browserAdapter);
runSuite(scopesSuite, browserAdapter);
runSuite(optionsSuite, browserAdapter);
runSuite(prefixSuite, browserAdapter);
runSuite(mixinsSuite, browserAdapter);
runSuite(spinnersSuite, browserAdapter);
