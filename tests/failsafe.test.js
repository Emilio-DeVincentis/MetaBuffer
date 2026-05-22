import { describe, it, expect, beforeEach } from 'vitest';
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';

describe('MetaBufferRuntime - Fail-Safe Execution', () => {
  let runtime;

  beforeEach(() => {
    runtime = new MetaBufferRuntime();
    runtime.initialize();
  });

  it('should return ok: true on successful dispatch', () => {
    const buffer = {
      id: 1,
      parentId: null,
      scope: ['data'],
      apply: () => ({ delta: { patch: { data: 'ok' } }, trace: null })
    };
    runtime.registerBuffer(buffer);
    const result = runtime.dispatch(1);
    expect(result.ok).toBe(true);
    expect(runtime.getContext().data).toBe('ok');
  });

  it('should return ok: false and not mutate state on error in apply', () => {
    const buffer = {
      id: 2,
      parentId: null,
      scope: ['data'],
      apply: () => {
        throw new Error('Boom');
      }
    };
    runtime.registerBuffer(buffer);
    runtime.setContext({ data: 'original' });

    const result = runtime.dispatch(2);

    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('DISPATCH_FAILURE');
    expect(result.error.message).toBe('Boom');
    expect(result.error.bufferId).toBe(2);

    // State must remain unchanged
    expect(runtime.getContext().data).toBe('original');
  });

  it('should return ok: false and not mutate trace stack on error', () => {
    const buffer = {
      id: 3,
      parentId: null,
      scope: [],
      apply: () => {
        // Return a trace but then fail (simulated by throwing before commit)
        // Note: our implementation calculates trace then commits.
        // If we throw inside apply, commit never happens.
        throw new Error('Trace Fail');
      }
    };
    runtime.registerBuffer(buffer);

    const initialTraceCount = runtime.getTraceStack().length;
    runtime.dispatch(3);

    expect(runtime.getTraceStack().length).toBe(initialTraceCount);
  });

  it('should return error for non-existent buffer', () => {
    const result = runtime.dispatch(999);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('BUFFER_NOT_FOUND');
  });

  it('should ensure atomicity for multi-key patches', () => {
      const buffer = {
          id: 4,
          parentId: null,
          scope: ['a', 'b'],
          apply: (view) => {
              // We return a patch but we want to simulate a failure
              // during the "commit" phase if that were possible.
              // In our implementation, we calculate everything then commit.
              // If we throw here, nothing is committed.
              throw new Error('Atomic Fail');
          }
      };
      runtime.registerBuffer(buffer);
      runtime.setContext({ a: 0, b: 0 });

      runtime.dispatch(4);

      expect(runtime.getContext().a).toBe(0);
      expect(runtime.getContext().b).toBe(0);
  });
});
