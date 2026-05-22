import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetaBufferRuntime } from '../../src/core/MetaBufferRuntime.js';
import { CommandBridge } from '../../src/host/bridge.js';
import { hydrateState, exportState } from '../../src/core/serialization.js';
import { rootBuffer } from '../../src/buffers/root.js';
import { editorBuffer } from '../../src/buffers/editor.js';

describe('Cold Start Persistence', () => {
  let runtime;
  let bridge;

  beforeEach(() => {
    runtime = new MetaBufferRuntime();
    runtime.registerBuffer(rootBuffer);
    runtime.registerBuffer(editorBuffer);
    bridge = new CommandBridge(runtime);
  });

  it('should preserve state and traces across export and hydration', () => {
    runtime.initialize();

    // Simulate some activity
    bridge.handleHostEvent({ kind: 'UI_INPUT', payload: 'Hello' });
    bridge.handleHostEvent({ kind: 'COMMAND', payload: { type: 'ACTIVATE_BUFFER', bufferId: 10 } });

    const contextBefore = runtime.getContext();
    const tracesBefore = runtime.getTraceStack();
    expect(tracesBefore.length).toBeGreaterThan(1);

    // Export
    const stateBlob = exportState(runtime);

    // Create new runtime (Cold Start)
    const newRuntime = new MetaBufferRuntime();
    newRuntime.registerBuffer(rootBuffer);
    newRuntime.registerBuffer(editorBuffer);

    // Hydrate
    const result = hydrateState(newRuntime, stateBlob);
    expect(result.ok).toBe(true);

    expect(newRuntime.getContext()).toEqual(contextBefore);
    expect(newRuntime.getTraceStack()).toEqual(tracesBefore);
    expect(newRuntime.getTraceStack()[0].id).toBe(1);
    expect(newRuntime.getTraceStack()[0].parentTraceId).toBeNull();
  });
});
