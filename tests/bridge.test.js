import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';
import { CommandBridge } from '../src/host/bridge.js';
import { editorBuffer } from '../src/buffers/editor.js';
import { executorBuffer } from '../src/buffers/executor.js';

describe('CommandBridge - Host Isolation Validation', () => {
  let runtime;
  let bridge;

  beforeEach(() => {
    runtime = new MetaBufferRuntime();
    runtime.registerBuffer(editorBuffer);
    runtime.registerBuffer(executorBuffer);
    bridge = new CommandBridge(runtime);
  });

  it('should propagate UI_INPUT to the runtime context and dispatch', () => {
    bridge.init();

    bridge.handleHostEvent({ kind: 'UI_INPUT', payload: 'const x = 1;' });

    const context = runtime.getContext();
    expect(context.js_source_code).toBe('const x = 1;');
    expect(context.incoming_input).toBeNull(); // Should be consumed by buffer
  });

  it('should observe and react to REQUESTED states', () => {
    // Mock the executeHostCommand to verify it's called
    const spy = vi.spyOn(bridge, 'executeHostCommand');

    bridge.init();

    // Manually set a REQUESTED state to simulate a buffer's delta
    runtime.setContext({
      ...runtime.getContext(),
      run_status: 'REQUESTED',
      js_source_code: 'test()'
    });

    // Trigger observation (in bridge.js this happens after events, but we test the method directly)
    bridge.checkKernelRequests();

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'SPAWN_PROCESS',
      payload: { code: 'test()' }
    }));
  });

  it('should handle falsy payloads correctly', () => {
    bridge.init();

    // Empty string is falsy but should be handled
    bridge.handleHostEvent({ kind: 'UI_INPUT', payload: '' });

    const context = runtime.getContext();
    expect(context.incoming_input).toBeNull(); // Dispatch happened and consumed the null/empty input
  });
});
