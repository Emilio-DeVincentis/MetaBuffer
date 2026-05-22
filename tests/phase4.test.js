import { describe, it, expect, beforeEach } from 'vitest';
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';
import { rootBuffer } from '../src/buffers/root.js';
import { agentBuffer } from '../src/buffers/agent.js';

describe('MetaBufferRuntime - Phase 4 (Agents)', () => {
  let runtime;

  beforeEach(() => {
    runtime = new MetaBufferRuntime();
    runtime.registerBuffer(rootBuffer);
    runtime.registerBuffer(agentBuffer);

    runtime.setContext({
      active_buffers: [1, 4],
      focus_stack: [1],
      agent_status: 'IDLE',
      agent_command: null,
      suggestions: {},
      pending_agent_result: null
    });
  });

  it('should handle full agent lifecycle (Request -> Result -> Consolidation)', async () => {
    // 1. User issues ACTIVATE_AGENT command via Root
    runtime.setContext({ ...runtime.getContext(), pending_command: { type: 'ACTIVATE_AGENT' } });
    runtime.dispatch(1); // Root dispatch
    expect(runtime.getContext().agent_command).toBe('ACTIVATE');

    // 2. Agent observes command and requests
    runtime.dispatch(4); // Agent dispatch
    expect(runtime.getContext().agent_status).toBe('REQUESTED');
    expect(runtime.getContext().agent_command).toBeNull();
    expect(runtime.getTraceStack().length).toBe(1); // Trace for activation

    // 3. Mock Device: observes REQUESTED and eventually provides result
    const mockResult = [
      { id: 's1', kind: 'edit', explanation: 'Mock fix' }
    ];

    // Inject result and dispatch Agent for consolidation
    runtime.setContext({ ...runtime.getContext(), pending_agent_result: mockResult });
    runtime.dispatch(4); // Agent consolidation dispatch

    expect(runtime.getContext().agent_status).toBe('IDLE');
    expect(runtime.getContext().suggestions['ai-agent']).toEqual(mockResult);
    expect(runtime.getContext().pending_agent_result).toBeNull();
    expect(runtime.getTraceStack().length).toBe(1); // STILL 1 trace (no new trace for consolidation)
  });

  it('should handle agent cancellation via Root', () => {
    // Start with a requested agent
    runtime.setContext({ ...runtime.getContext(), agent_status: 'REQUESTED' });

    // 1. User cancels agent via Root
    runtime.setContext({ ...runtime.getContext(), pending_command: { type: 'CANCEL_AGENT' } });
    runtime.dispatch(1);

    expect(runtime.getContext().agent_status).toBe('IDLE');
    expect(runtime.getTraceStack().length).toBe(1); // Trace for cancellation
    expect(runtime.getTraceStack()[0].metaBufferId).toBe(1);
  });

  it('should maintain multi-producer suggestions', () => {
    runtime.setContext({
      ...runtime.getContext(),
      suggestions: { 'other-agent': [] },
      pending_agent_result: [{ id: 's2' }]
    });

    runtime.dispatch(4);

    const sug = runtime.getContext().suggestions;
    expect(sug['other-agent']).toBeDefined();
    expect(sug['ai-agent']).toBeDefined();
  });
});
