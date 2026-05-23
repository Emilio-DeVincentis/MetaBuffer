// @ts-check

import { canonicalStringify, success, failure } from './utils.js';

/** @typedef {import('./MetaBufferRuntime.js').KernelState} KernelState */
/** @typedef {import('../types/index.js').ExecutionResult} ExecutionResult */

/**
 * Exports the runtime state to a canonical JSON blob.
 * @param {KernelState} state
 * @returns {string}
 */
export function exportState(state) {
  const exportable = {
    context: state.context,
    traceStack: state.traceStack,
    nextTraceId: state.nextTraceId,
    snapshotInterval: state.snapshotInterval,
    // Map needs conversion for JSON serialization
    snapshots: Array.from(state.snapshots.entries())
  };

  return canonicalStringify(exportable);
}

/**
 * Hydrates the kernel state with a state blob.
 * @param {KernelState} state
 * @param {string} blob
 * @returns {ExecutionResult & { state?: KernelState }}
 */
export function hydrateState(state, blob) {
  try {
    const data = JSON.parse(blob);

    // 1. Validation
    if (!data.traceStack || !Array.isArray(data.traceStack) || data.traceStack.length === 0) {
      return failure('ERR_CORE_BOOTSTRAP_MISSING', 'Trace stack is empty or missing.');
    }

    const firstTrace = data.traceStack[0];
    if (firstTrace.id !== 1 || firstTrace.parentTraceId !== null) {
      return failure('ERR_CORE_BOOTSTRAP_MISSING', 'Bootstrap trace integrity failure.');
    }

    // 2. Hydration
    const newState = {
        ...state,
        context: data.context || {},
        traceStack: [...data.traceStack],
        nextTraceId: data.nextTraceId || (data.traceStack.reduce((max, t) => Math.max(max, t.id), 0) + 1),
        snapshotInterval: data.snapshotInterval || state.snapshotInterval,
        snapshots: new Map(data.snapshots || [])
    };

    return { ...success(newState), state: newState };
  } catch (e) {
    return failure('ERR_CORE_HYDRATION_FAILURE', e instanceof Error ? e.message : 'Invalid state blob');
  }
}
