import { describe, it, expect, beforeEach } from 'vitest';
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';
import { rootBuffer } from '../src/buffers/root.js';
import { editorBuffer } from '../src/buffers/editor.js';

describe('MetaBufferRuntime - Phase 2 (Default World)', () => {
  let runtime;

  beforeEach(() => {
    runtime = new MetaBufferRuntime();
    runtime.registerBuffer(rootBuffer);
    runtime.registerBuffer(editorBuffer);

    // Initial State Setup (Bootstrap)
    runtime.setContext({
      active_buffers: [1], // Root is always active
      focus_stack: [1],
      pending_command: null,
      js_source_code: '',
      cursor_position: 0
    });
  });

  it('should handle bootstrap trace for root buffer', () => {
    // Manually trigger a setup trace if desired, or just verify initial state
    // According to specifications, root activation generates the first trace.
    // We can simulate this by dispatching a NO-OP command or just dispatching root once.

    runtime.dispatch(1);
    // No command, so trace should be null in rootBuffer logic unless we explicitly want a setup trace.
    // Let's refine the root buffer to emit a trace on "ACTIVATE" if we want that initial state.

    // For now, let's test command-based trace generation.
    runtime.setContext({
      ...runtime.getContext(),
      pending_command: { type: 'ACTIVATE_BUFFER', bufferId: 2 }
    });

    runtime.dispatch(1);

    expect(runtime.getContext().active_buffers).toContain(2);
    expect(runtime.getContext().focus_stack).toContain(2);
    expect(runtime.getContext().pending_command).toBeNull();
    expect(runtime.getTraceStack().length).toBe(1);
    expect(runtime.getTraceStack()[0].metaBufferId).toBe(1);
  });

  it('should allow typing in Editor without generating traces', () => {
    // Simulate typing 'a'
    runtime.setContext({
      ...runtime.getContext(),
      incoming_input: 'a'
    });
    runtime.dispatch(2);

    expect(runtime.getContext().js_source_code).toBe('a');
    expect(runtime.getContext().cursor_position).toBe(1);
    expect(runtime.getContext().incoming_input).toBeNull();

    // Simulate typing 'b'
    runtime.setContext({
      ...runtime.getContext(),
      incoming_input: 'b'
    });
    runtime.dispatch(2);

    expect(runtime.getContext().js_source_code).toBe('ab');
    expect(runtime.getTraceStack().length).toBe(0); // Still 0 traces from typing
  });

  it('should maintain causal link between structural changes', () => {
    // 1. Activate Editor (Root dispatch -> Trace)
    runtime.setContext({
      ...runtime.getContext(),
      pending_command: { type: 'ACTIVATE_BUFFER', bufferId: 2 }
    });
    runtime.dispatch(1);

    // 2. Type something (Editor dispatch -> NO Trace)
    runtime.setContext({
      ...runtime.getContext(),
      incoming_input: 'const x = 1;'
    });
    runtime.dispatch(2);

    // 3. Another structural change (e.g. activating a third buffer - hypothetical)
    runtime.setContext({
      ...runtime.getContext(),
      pending_command: { type: 'ACTIVATE_BUFFER', bufferId: 3 }
    });
    runtime.dispatch(1);

    const stack = runtime.getTraceStack();
    expect(stack.length).toBe(2);
    expect(stack[1].parentTraceId).toBe(stack[0].id);
  });

  it('should prevent Editor from writing to root scope', () => {
    // Editor buffer scope: ['js_source_code', 'cursor_position', 'incoming_input']
    // It should NOT be able to modify 'active_buffers'

    const rogueEditor = {
      ...editorBuffer,
      apply: (view) => ({
        delta: { patch: { active_buffers: [], js_source_code: 'hacked' } },
        trace: null
      })
    };

    runtime.registerBuffer(rogueEditor);
    runtime.dispatch(2);

    expect(runtime.getContext().active_buffers).toEqual([1]); // Unchanged
    expect(runtime.getContext().js_source_code).toBe('hacked'); // Allowed because it is in scope
  });
});
