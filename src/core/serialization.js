// @ts-check

/** @typedef {import('./MetaBufferRuntime.js').MetaBufferRuntime} MetaBufferRuntime */
/** @typedef {import('../types/index.js').ExecutionResult} ExecutionResult */

/**
 * Deterministic JSON stringify helper (canonical ordering).
 * @param {any} obj
 * @returns {string}
 */
export function canonicalStringify(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return '[' + obj.map(item => canonicalStringify(item)).join(',') + ']';
  }

  const keys = Object.keys(obj).sort();
  return '{' + keys.map(key => {
    return JSON.stringify(key) + ':' + canonicalStringify(obj[key]);
  }).join(',') + '}';
}

/**
 * Exports the runtime state to a canonical JSON blob.
 * @param {MetaBufferRuntime} runtime
 * @returns {string}
 */
export function exportState(runtime) {
  const state = {
    context: runtime.getContext(),
    traceStack: runtime.getTraceStack(),
    // nextTraceId is private but needed for continuity.
    // We can derive it or expose it. Let's derive it to stay suckless.
    nextTraceId: runtime.getTraceStack().reduce((max, t) => Math.max(max, t.id), 0) + 1
  };

  return canonicalStringify(state);
}

/**
 * Hydrates the runtime with a state blob.
 * @param {MetaBufferRuntime} runtime
 * @param {string} blob
 * @returns {ExecutionResult}
 */
export function hydrateState(runtime, blob) {
  try {
    const data = JSON.parse(blob);

    // 1. Validation
    if (!data.traceStack || !Array.isArray(data.traceStack) || data.traceStack.length === 0) {
      return {
        ok: false,
        error: { code: 'ERR_CORE_BOOTSTRAP_MISSING', message: 'Trace stack is empty or missing.' }
      };
    }

    const firstTrace = data.traceStack[0];
    // Bootstrap integrity check: ID: 1, parentTraceId: null.
    // (Note: Buffer ID for bootstrap is usually 1, but we focus on ID and parent link)
    if (firstTrace.id !== 1 || firstTrace.parentTraceId !== null) {
      return {
        ok: false,
        error: { code: 'ERR_CORE_BOOTSTRAP_MISSING', message: 'Bootstrap trace integrity failure.' }
      };
    }

    // 2. Hydration
    runtime.setContext(data.context || {});
    // @ts-ignore - access private property to ensure continuity
    runtime.traceStack = [...data.traceStack];
    // @ts-ignore - access private property
    runtime.nextTraceId = data.nextTraceId || (data.traceStack.reduce((max, t) => Math.max(max, t.id), 0) + 1);

    // Clear old snapshots as they might be inconsistent with the new history
    // @ts-ignore
    runtime.snapshots.clear();

    return { ok: true, success: true };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'ERR_CORE_HYDRATION_FAILURE',
        message: e instanceof Error ? e.message : 'Invalid state blob'
      }
    };
  }
}
