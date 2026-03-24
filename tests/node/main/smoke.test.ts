import { expect, test } from '@rstest/core';

test('rstest runs in node environment', () => {
  expect(typeof process).toBe('object');
  expect(typeof process.stdout).toBe('object');
});
