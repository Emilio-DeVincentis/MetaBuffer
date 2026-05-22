import { describe, it, expect } from 'vitest';
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';
import { rootBuffer } from '../src/buffers/root.js';
import { editorBuffer } from '../src/buffers/editor.js';
import { jsAnalyzerBuffer } from '../src/buffers/jsAnalyzer.js';
import { agentBuffer } from '../src/buffers/agent.js';
import { executorBuffer } from '../src/buffers/executor.js';
import { renderLayout } from '../src/core/layout.js';
import { projectCode, projectTerminal } from '../src/core/projections.js';

describe('MetaBuffer System - End-to-End Validation', () => {
  it('should complete the full reflective workflow', () => {
    const runtime = new MetaBufferRuntime();

    // Register all buffers
    runtime.registerBuffer(rootBuffer);
    runtime.registerBuffer(editorBuffer);
    runtime.registerBuffer(jsAnalyzerBuffer);
    runtime.registerBuffer(agentBuffer);
    runtime.registerBuffer(executorBuffer);

    // Bootstrap
    runtime.setContext({
      active_buffers: [1, 2],
      focus_stack: [1, 2],
      js_source_code: '',
      diagnostics: {},
      suggestions: {},
      runtime_output: [],
      agent_status: 'IDLE',
      run_status: 'IDLE'
    });

    // 1. Typing in Editor (Content mutation -> No Trace)
    runtime.setContext({ ...runtime.getContext(), incoming_input: 'function main() {' });
    runtime.dispatch(2);
    expect(projectCode(runtime.getContext())).toBe('function main() {');
    expect(runtime.getTraceStack().length).toBe(0);
    expect(runtime.getContext().needs_analysis).toBe(true);

    // 2. Analysis (Structural change -> Trace 1)
    runtime.dispatch(1); // Root clears signal
    runtime.dispatch(3); // Analyzer run
    expect(runtime.getContext().diagnostics['js-analyzer'].length).toBe(1); // Unbalanced brace
    expect(runtime.getTraceStack().length).toBe(1);
    expect(runtime.getTraceStack()[0].metaBufferId).toBe(3);

    // 3. Agent Request (Structural change -> Trace 2)
    runtime.setContext({ ...runtime.getContext(), pending_command: { type: 'ACTIVATE_AGENT' } });
    runtime.dispatch(1); // Root handles command
    runtime.dispatch(4); // Agent handles activation
    expect(runtime.getContext().agent_status).toBe('REQUESTED');
    expect(runtime.getTraceStack().length).toBe(2);

    // Mock Agent Result (Consolidation -> No Trace)
    runtime.setContext({
      ...runtime.getContext(),
      pending_agent_result: [{ id: 's1', kind: 'edit', replacement: '}' }]
    });
    runtime.dispatch(4);
    expect(runtime.getContext().agent_status).toBe('IDLE');
    expect(runtime.getTraceStack().length).toBe(2); // Still 2

    // 4. Run (Structural change -> Trace 3)
    runtime.setContext({ ...runtime.getContext(), pending_command: { type: 'ACTIVATE_RUN' } });
    runtime.dispatch(1);
    runtime.dispatch(5);
    expect(runtime.getContext().run_status).toBe('REQUESTED');
    expect(runtime.getTraceStack().length).toBe(3);

    // Mock Execution Output
    runtime.setContext({ ...runtime.getContext(), incoming_output_chunk: { type: 'stdout', text: 'Done' } });
    runtime.dispatch(5);
    runtime.setContext({ ...runtime.getContext(), incoming_output_chunk: { type: 'exit', code: 0 } });
    runtime.dispatch(5);
    expect(projectTerminal(runtime.getContext())[0].text).toBe('Done');
    expect(runtime.getTraceStack().length).toBe(3); // Still 3

    // 5. Layout Verification
    const layout = renderLayout(runtime.getContext());
    expect(layout.type).toBe('linear');
    // Root and Editor are active
    expect(layout.panes.some(p => p.bufferId === 2)).toBe(true);

    // Check causal links in Trace stack
    const stack = runtime.getTraceStack();
    expect(stack[1].parentTraceId).toBe(stack[0].id);
    expect(stack[2].parentTraceId).toBe(stack[1].id);

    console.log('E2E Validation Passed: Full lifecycle verified.');
  });
});
