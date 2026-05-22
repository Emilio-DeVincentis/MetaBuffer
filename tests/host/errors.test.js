import { describe, it, expect, beforeEach } from 'vitest';
import { MetaBufferRuntime } from '../../src/core/MetaBufferRuntime.js';
import { CommandBridge } from '../../src/host/bridge.js';
import { rootBuffer } from '../../src/buffers/root.js';

describe('Error Handling End-to-End', () => {
  let runtime;
  let bridge;

  beforeEach(() => {
    runtime = new MetaBufferRuntime();
    runtime.registerBuffer(rootBuffer);
    bridge = new CommandBridge(runtime);
    runtime.initialize();
  });

  it('should handle dispatch to non-existent buffer gracefully', () => {
    const result = bridge.handleHostEvent({ kind: 'COMMAND', payload: { type: 'ACTIVATE_BUFFER', bufferId: 999 } });
    // Root buffer will process the command and update focus_stack, but when we try to dispatch 999...
    // Actually bridge only dispatches what it's told.

    // Direct dispatch error
    const errResult = runtime.dispatch(999);
    expect(errResult.ok).toBe(false);
    expect(errResult.error.code).toBe('BUFFER_NOT_FOUND');
  });

  it('should handle malformed apply return in buffers (simulation)', () => {
    const faultyBuffer = {
        id: 13,
        parentId: 1,
        scope: ['*'],
        apply: () => { throw new Error('Crashed'); }
    };
    runtime.registerBuffer(faultyBuffer);
    const result = runtime.dispatch(13);
    expect(result.ok).toBe(false);
    expect(result.error.code).toBe('DISPATCH_FAILURE');
    expect(result.error.message).toBe('Crashed');
  });
});
