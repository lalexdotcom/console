// Alias target for rspack source.alias in the node-tty rstest project (wired in Phase 10).
// Re-exports everything from the real env module, then overrides the two TTY environment
// flags as compile-time constants so any bundled code that imports from this path sees
// isNodeTTY = true / isNodeConsole = false with no runtime evaluation.
// This file MUST NOT read process.env or contain any conditional logic.
export * from '../../src/utils/env';
export const isNodeTTY = true;
export const isNodeConsole = false;
