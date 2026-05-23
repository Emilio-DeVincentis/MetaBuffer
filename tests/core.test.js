import { describe, it, expect, beforeEach } from 'vitest';
import * as Runtime from '../src/core/MetaBufferRuntime.js';

describe('MetaBufferRuntime - Phase 1', () => {
  let state;

  beforeEach(() => {
    state = Runtime.createInitialState();
  });

  it('should register and dispatch a MetaBuffer', () => {
    const buffer = {
      id: 1,
      parentId: null,
      scope: ['text'],
      apply: (view) => {
        return {
          delta: { patch: { text: 'Hello World' } },
          trace: { id: 0, metaBufferId: 0, parentTraceId: null, scope: [] } // Template trace
        };
      }
    };

    state = Runtime.registerBuffer(state, buffer);
    const result = Runtime.dispatch(state, 1);
    state = result.state;

    expect(state.context.text).toBe('Hello World');
    expect(state.traceStack.length).toBe(1);
    expect(state.traceStack[0].metaBufferId).toBe(1);
  });

  it('should enforce scope isolation for reading', () => {
    state = Runtime.setContext(state, { secret: 'hidden', public: 'visible' });

    const buffer = {
      id: 2,
      parentId: null,
      scope: ['public', 'observedSecret'],
      apply: (view) => {
        // 'secret' should not be in the view.state
        const secretVisible = view.state.secret !== undefined;
        return {
          delta: { patch: { observedSecret: secretVisible } },
          trace: null
        };
      }
    };

    state = Runtime.registerBuffer(state, buffer);
    const result = Runtime.dispatch(state, 2);
    state = result.state;
    expect(state.context.observedSecret).toBe(false);
  });

  it('should enforce scope isolation for writing', () => {
    const buffer = {
      id: 3,
      parentId: null,
      scope: ['allowed'],
      apply: (view) => {
        return {
          delta: {
            patch: {
              allowed: 'success',
              forbidden: 'should fail'
            }
          },
          trace: null
        };
      }
    };

    state = Runtime.registerBuffer(state, buffer);
    const result = Runtime.dispatch(state, 3);
    state = result.state;

    expect(state.context.allowed).toBe('success');
    expect(state.context.forbidden).toBeUndefined();
  });

  it('should correctly link traces in the stack', () => {
    const bufferA = {
      id: 101,
      parentId: null,
      scope: [],
      apply: () => ({ delta: null, trace: { id: 0, metaBufferId: 0, parentTraceId: null, scope: [] } })
    };

    const bufferB = {
      id: 102,
      parentId: 101,
      scope: [],
      apply: () => ({ delta: null, trace: { id: 0, metaBufferId: 0, parentTraceId: null, scope: [] } })
    };

    state = Runtime.registerBuffer(state, bufferA);
    state = Runtime.registerBuffer(state, bufferB);

    state = Runtime.dispatch(state, 101).state;
    state = Runtime.dispatch(state, 102).state;

    const stack = state.traceStack;
    expect(stack.length).toBe(2);
    expect(stack[1].parentTraceId).toBe(stack[0].id);
    expect(stack[0].parentTraceId).toBeNull();
  });

  it('should not generate a trace if apply returns null trace', () => {
    const buffer = {
      id: 4,
      parentId: null,
      scope: ['counter'],
      apply: (view) => {
        const count = (view.state.counter || 0) + 1;
        return {
          delta: { patch: { counter: count } },
          trace: null
        };
      }
    };

    state = Runtime.registerBuffer(state, buffer);
    state = Runtime.dispatch(state, 4).state;
    state = Runtime.dispatch(state, 4).state;

    expect(state.context.counter).toBe(2);
    expect(state.traceStack.length).toBe(0);
  });
});
