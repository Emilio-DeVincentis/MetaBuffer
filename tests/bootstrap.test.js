import { describe, it, expect, beforeEach } from 'vitest';
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';

describe('MetaBufferRuntime - Bootstrap Validation', () => {
  let runtime;

  beforeEach(() => {
    runtime = new MetaBufferRuntime();
  });

  it('should emit BOOTSTRAP trace on initialize()', () => {
    expect(runtime.getTraceStack().length).toBe(0);

    runtime.initialize();

    const stack = runtime.getTraceStack();
    expect(stack.length).toBe(1);
    expect(stack[0].metaBufferId).toBe(1); // Root ID
    expect(stack[0].parentTraceId).toBeNull();
    expect(stack[0].scope).toContain('*');
  });

  it('should maintain BOOTSTRAP as the root of the trace stack', () => {
    runtime.initialize();

    const buffer = {
      id: 2,
      parentId: 1,
      scope: [],
      apply: () => ({ delta: null, trace: { id: 0, metaBufferId: 2, parentTraceId: null, scope: [] } })
    };

    runtime.registerBuffer(buffer);
    runtime.dispatch(2);

    const stack = runtime.getTraceStack();
    expect(stack.length).toBe(2);
    expect(stack[0].metaBufferId).toBe(1);
    expect(stack[1].metaBufferId).toBe(2);
    expect(stack[1].parentTraceId).toBe(stack[0].id);
  });
});
