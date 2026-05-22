import { describe, it, expect, beforeEach } from 'vitest';
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';
import { rootBuffer } from '../src/buffers/root.js';
import { editorBuffer } from '../src/buffers/editor.js';
import { jsAnalyzerBuffer } from '../src/buffers/jsAnalyzer.js';

describe('MetaBufferRuntime - Phase 3 (JS Analysis)', () => {
  let runtime;

  beforeEach(() => {
    runtime = new MetaBufferRuntime();
    runtime.registerBuffer(rootBuffer);
    runtime.registerBuffer(editorBuffer);
    runtime.registerBuffer(jsAnalyzerBuffer);

    runtime.setContext({
      active_buffers: [1, 2],
      focus_stack: [1, 2],
      js_source_code: '',
      diagnostics: {},
      needs_analysis: false
    });
  });

  it('should detect unbalanced braces', () => {
    runtime.setContext({
      ...runtime.getContext(),
      js_source_code: 'function test() { if (true) { }' // Missing one '}'
    });

    runtime.dispatch(3); // Dispatch Analyzer

    const diagnostics = runtime.getContext().diagnostics;
    expect(diagnostics['js-analyzer']).toBeDefined();
    expect(diagnostics['js-analyzer'].length).toBeGreaterThan(0);
    expect(diagnostics['js-analyzer'][0]).toContain('Unbalanced opening brace');
  });

  it('should produce a trace when analyzer is dispatched', () => {
    runtime.dispatch(3);
    expect(runtime.getTraceStack().length).toBe(1);
    expect(runtime.getTraceStack()[0].metaBufferId).toBe(3);
  });

  it('should flow signals from Editor to Root', () => {
    // 1. Type in Editor
    runtime.setContext({ ...runtime.getContext(), incoming_input: '{' });
    runtime.dispatch(2);

    expect(runtime.getContext().needs_analysis).toBe(true);

    // 2. Root observes and clears signal
    runtime.dispatch(1);
    expect(runtime.getContext().needs_analysis).toBe(false);

    // 3. Analyzer is then dispatched (by external coordination)
    runtime.dispatch(3);
    expect(runtime.getContext().diagnostics['js-analyzer'].length).toBe(1);
  });

  it('should support multi-producer diagnostics', () => {
    // Pre-fill with another producer's data
    runtime.setContext({
      ...runtime.getContext(),
      diagnostics: { 'other-tool': ['error'] }
    });

    runtime.dispatch(3);

    const diag = runtime.getContext().diagnostics;
    expect(diag['other-tool']).toEqual(['error']);
    expect(diag['js-analyzer']).toBeDefined();
  });
});
