import { describe, it, expect, beforeEach } from 'vitest';
import * as Runtime from '../src/core/MetaBufferRuntime.js';
import { exportState, hydrateState } from '../src/core/serialization.js';
import { canonicalStringify } from '../src/core/utils.js';

describe('MetaBufferRuntime - Phase 3.5 (Serialization & Hydration)', () => {
  let state;

  beforeEach(() => {
    state = Runtime.createInitialState();
    state = Runtime.initialize(state).state; // Generates bootstrap trace
    state = Runtime.registerBuffer(state, {
      id: 1,
      scope: ['a', 'b'],
      apply: (view) => ({ delta: { patch: { a: 1 } }, trace: { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] } })
    });
  });

  it('should export and hydrate state successfully', () => {
    state = Runtime.setContext(state, { a: 10, b: 20 });
    state = Runtime.dispatch(state, 1).state;

    const blob = exportState(state);
    let newState = Runtime.createInitialState();

    const result = hydrateState(newState, blob);
    newState = result.state;

    expect(result.ok).toBe(true);
    expect(newState.context).toEqual(state.context);
    expect(newState.traceStack).toEqual(state.traceStack);
    expect(newState.nextTraceId).toBe(state.traceStack.length + 1);
  });

  it('should satisfy idempotency: export(hydrate(export(state))) === export(state)', () => {
    state = Runtime.setContext(state, { z: 9, x: { b: 1, a: 2 } });
    state = Runtime.dispatch(state, 1).state;

    const blob1 = exportState(state);

    let newState = Runtime.createInitialState();
    newState = hydrateState(newState, blob1).state;
    const blob2 = exportState(newState);

    expect(blob1).toBe(blob2);
  });

  it('should fail hydration if bootstrap trace is missing or invalid', () => {
    const invalidBlob = canonicalStringify({
      context: {},
      traceStack: [
        { id: 2, metaBufferId: 1, parentTraceId: 1, scope: [] } // Starts at ID 2
      ],
      nextTraceId: 3
    });

    let newState = Runtime.createInitialState();
    const result = hydrateState(newState, invalidBlob);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('ERR_CORE_BOOTSTRAP_MISSING');
  });

  it('should ensure canonical ordering of keys', () => {
    const obj1 = { b: 1, a: 2 };
    const obj2 = { a: 2, b: 1 };

    expect(canonicalStringify(obj1)).toBe(canonicalStringify(obj2));
    expect(canonicalStringify(obj1)).toBe('{"a":2,"b":1}');
  });

  it('should continue trace sequence correctly after hydration', () => {
    state = Runtime.dispatch(state, 1).state;
    const blob = exportState(state);

    let newState = Runtime.createInitialState();
    newState = Runtime.registerBuffer(newState, {
      id: 1,
      scope: ['a'],
      apply: () => ({ delta: null, trace: { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] } })
    });

    newState = hydrateState(newState, blob).state;
    newState = Runtime.dispatch(newState, 1).state;

    const stack = newState.traceStack;
    expect(stack.length).toBe(3); // Bootstrap + dispatch1 + dispatch2
    expect(stack[2].id).toBe(3);
    expect(stack[2].parentTraceId).toBe(2);
  });
});
