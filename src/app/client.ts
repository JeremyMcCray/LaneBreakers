// @ts-nocheck
/** Public client entry — boot + re-exports used by tools/tests. */
export { bootClient, bindGlobals } from './boot';
export { G } from './state';
export { startPractice, beginMatch, cmd, loop } from './shell';
export { dbg } from '../ui/panels';
