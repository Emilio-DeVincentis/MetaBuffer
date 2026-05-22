import { describe, it, expect, beforeEach } from 'vitest';
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';
import { exportState, hydrateState, canonicalStringify } from '../src/core/serialization.js';

describe('MetaBufferRuntime - Phase 3.5 (Serialization & Hydration)', () => {
  let runtime;

  beforeEach(() => {
    runtime = new MetaBufferRuntime();
    runtime.initialize(); // Generates bootstrap trace
    runtime.registerBuffer({
      id: 1,
      scope: ['a', 'b'],
      apply: (view) => ({ delta: { patch: { a: 1 } }, trace: { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] } })
    });
  });

  it('should export and hydrate state successfully', () => {
    runtime.setContext({ a: 10, b: 20 });
    runtime.dispatch(1);

    const blob = exportState(runtime);
    const newRuntime = new MetaBufferRuntime();

    const result = hydrateState(newRuntime, blob);

    expect(result.ok).toBe(true);
    expect(newRuntime.getContext()).toEqual(runtime.getContext());
    expect(newRuntime.getTraceStack()).toEqual(runtime.getTraceStack());
    // @ts-ignore
    expect(newRuntime.nextTraceId).toBe(runtime.getTraceStack().length + 1);
  });

  it('should satisfy idempotency: export(hydrate(export(state))) === export(state)', () => {
    runtime.setContext({ z: 9, x: { b: 1, a: 2 } });
    runtime.dispatch(1);

    const blob1 = exportState(runtime);

    const newRuntime = new MetaBufferRuntime();
    hydrateState(newRuntime, blob1);
    const blob2 = exportState(newRuntime);

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

    const newRuntime = new MetaBufferRuntime();
    const result = hydrateState(newRuntime, invalidBlob);

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
    runtime.dispatch(1);
    const blob = exportState(runtime);

    const newRuntime = new MetaBufferRuntime();
    newRuntime.registerBuffer({
      id: 1,
      scope: ['a'],
      apply: () => ({ delta: null, trace: { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] } })
    });

    hydrateState(newRuntime, blob);
    newRuntime.dispatch(1);

    const stack = newRuntime.getTraceStack();
    expect(stack.length).toBe(3); // Bootstrap + dispatch1 + dispatch2
    expect(stack[2].id).toBe(3);
    expect(stack[2].parentTraceId).toBe(2);
  });
});
