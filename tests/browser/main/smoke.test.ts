import { expect, test } from '@rstest/core';

test('rstest runs in browser environment', () => {
  expect(typeof document).toBe('object');
  expect(typeof window).toBe('object');
});
