import { describe, it, expect, beforeEach } from 'vitest';
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';

describe('MetaBufferRuntime - Phase 1', () => {
  let runtime;

  beforeEach(() => {
    runtime = new MetaBufferRuntime();
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

    runtime.registerBuffer(buffer);
    runtime.dispatch(1);

    expect(runtime.getContext().text).toBe('Hello World');
    expect(runtime.getTraceStack().length).toBe(1);
    expect(runtime.getTraceStack()[0].metaBufferId).toBe(1);
  });

  it('should enforce scope isolation for reading', () => {
    runtime.setContext({ secret: 'hidden', public: 'visible' });

    const buffer = {
      id: 2,
      parentId: null,
      scope: ['public'],
      apply: (view) => {
        // 'secret' should not be in the view.state
        const secretVisible = view.state.secret !== undefined;
        return {
          delta: { patch: { observedSecret: secretVisible } },
          trace: null
        };
      }
    };

    runtime.registerBuffer(buffer);
    // Add observedSecret to scope so we can write it
    buffer.scope.push('observedSecret');

    runtime.dispatch(2);
    expect(runtime.getContext().observedSecret).toBe(false);
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

    runtime.registerBuffer(buffer);
    runtime.dispatch(3);

    expect(runtime.getContext().allowed).toBe('success');
    expect(runtime.getContext().forbidden).toBeUndefined();
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

    runtime.registerBuffer(bufferA);
    runtime.registerBuffer(bufferB);

    runtime.dispatch(101);
    runtime.dispatch(102);

    const stack = runtime.getTraceStack();
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

    runtime.registerBuffer(buffer);
    runtime.dispatch(4);
    runtime.dispatch(4);

    expect(runtime.getContext().counter).toBe(2);
    expect(runtime.getTraceStack().length).toBe(0);
  });
});
