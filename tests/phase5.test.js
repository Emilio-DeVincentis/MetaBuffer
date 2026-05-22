import { describe, it, expect, beforeEach } from 'vitest';
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';
import { rootBuffer } from '../src/buffers/root.js';
import { executorBuffer } from '../src/buffers/executor.js';

describe('MetaBufferRuntime - Phase 5 (Execution)', () => {
  let runtime;

  beforeEach(() => {
    runtime = new MetaBufferRuntime();
    runtime.registerBuffer(rootBuffer);
    runtime.registerBuffer(executorBuffer);

    runtime.setContext({
      active_buffers: [1, 5],
      focus_stack: [1],
      run_status: 'IDLE',
      run_command: null,
      runtime_output: [],
      incoming_output_chunk: null
    });
  });

  it('should handle full execution lifecycle (Request -> Streaming -> Exit)', () => {
    // 1. User activates run via Root
    runtime.setContext({ ...runtime.getContext(), pending_command: { type: 'ACTIVATE_RUN' } });
    runtime.dispatch(1);
    expect(runtime.getContext().run_command).toBe('ACTIVATE');

    // 2. Executor observes and requests
    runtime.dispatch(5);
    expect(runtime.getContext().run_status).toBe('REQUESTED');
    expect(runtime.getTraceStack().length).toBe(1); // Trace for activation

    // 3. Streaming output (Mock Device)
    runtime.setContext({ ...runtime.getContext(), incoming_output_chunk: { type: 'stdout', text: 'Hello' } });
    runtime.dispatch(5);
    expect(runtime.getContext().runtime_output.length).toBe(1);
    expect(runtime.getTraceStack().length).toBe(1); // No new trace for output

    runtime.setContext({ ...runtime.getContext(), incoming_output_chunk: { type: 'stdout', text: 'World' } });
    runtime.dispatch(5);
    expect(runtime.getContext().runtime_output.length).toBe(2);

    // 4. Exit signal
    runtime.setContext({ ...runtime.getContext(), incoming_output_chunk: { type: 'exit', code: 0 } });
    runtime.dispatch(5);
    expect(runtime.getContext().run_status).toBe('IDLE');
    expect(runtime.getContext().runtime_output.length).toBe(3);
    expect(runtime.getTraceStack().length).toBe(1); // No new trace for exit (it is work completion)
  });

  it('should handle killing a run via Root', () => {
    // Start with a requested run
    runtime.setContext({ ...runtime.getContext(), run_status: 'REQUESTED' });

    // 1. User kills run via Root
    runtime.setContext({ ...runtime.getContext(), pending_command: { type: 'KILL_RUN' } });
    runtime.dispatch(1);

    expect(runtime.getContext().run_status).toBe('IDLE');
    expect(runtime.getContext().run_command).toBe('KILL');
    expect(runtime.getTraceStack().length).toBe(1); // Trace for KILL
    expect(runtime.getTraceStack()[0].metaBufferId).toBe(1);
  });
});
