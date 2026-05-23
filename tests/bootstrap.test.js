import { describe, it, expect, beforeEach } from 'vitest';
import * as Runtime from '../src/core/MetaBufferRuntime.js';

describe('MetaBufferRuntime - Bootstrap Validation', () => {
  let state;

  beforeEach(() => {
    state = Runtime.createInitialState();
  });

  it('should emit BOOTSTRAP trace on initialize()', () => {
    expect(state.traceStack.length).toBe(0);

    const result = Runtime.initialize(state);
    state = result.state;

    expect(state.traceStack.length).toBe(1);
    expect(state.traceStack[0].metaBufferId).toBe(1); // Root ID
    expect(state.traceStack[0].parentTraceId).toBeNull();
    expect(state.traceStack[0].scope).toContain('*');
  });

  it('should maintain BOOTSTRAP as the root of the trace stack', () => {
    const initRes = Runtime.initialize(state);
    state = initRes.state;

    const buffer = {
      id: 2,
      parentId: 1,
      scope: [],
      apply: () => ({ delta: null, trace: { id: 0, metaBufferId: 2, parentTraceId: null, scope: [] } })
    };

    state = Runtime.registerBuffer(state, buffer);
    const dispatchRes = Runtime.dispatch(state, 2);
    state = dispatchRes.state;

    expect(state.traceStack.length).toBe(2);
    expect(state.traceStack[0].metaBufferId).toBe(1);
    expect(state.traceStack[1].metaBufferId).toBe(2);
    expect(state.traceStack[1].parentTraceId).toBe(state.traceStack[0].id);
  });
});
