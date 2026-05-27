import { describe, it, expect, beforeEach } from 'vitest';
import * as Runtime from '../../src/core/MetaBufferRuntime.js';
import { executorBuffer } from '../../src/buffers/executor.js';
import { transformerBuffer } from '../../src/buffers/transformer.js';
import { outputBuffer } from '../../src/buffers/output.js';

describe('Shell Reaction Pipeline - Transformer -> Output', () => {
    let state;

    beforeEach(() => {
        state = Runtime.createInitialState();
        state = Runtime.registerBuffer(state, executorBuffer);
        state = Runtime.registerBuffer(state, transformerBuffer);
        state = Runtime.registerBuffer(state, outputBuffer);

        // Use Root buffer to initialize buffers via a structural trace,
        // so that reconstruction can find them.
        state = Runtime.initialize(state).state; // Trace 1 (Bootstrap)

        // Mock a structural setup trace (using buffer 1 for simplicity)
        state = Runtime.registerBuffer(state, {
            id: 1,
            scope: ['*'],
            apply: () => ({
                delta: {
                    patch: {
                        js_source_code: 'hello',
                        buffers: {
                            7: { id: 7, kind: 'inspector', content: '' },
                            8: { id: 8, kind: 'inspector', content: '' }
                        }
                    }
                },
                trace: { id: 0, metaBufferId: 1, parentTraceId: null, scope: ['*'] }
            })
        });

        state = Runtime.dispatch(state, 1).state; // Trace 2: Setup
    });

    it('should execute single dispatch triggering transformer -> output pipeline', () => {
        // 1. Dispatch executor ACTIVATE (this emits EXECUTION_STARTED)
        state = Runtime.setContext(state, { ...state.context, run_command: 'ACTIVATE' });
        const result = Runtime.dispatch(state, 5); // Trace 3
        state = result.state;

        expect(result.ok).toBe(true);

        // 2. Verify: Transformer reacted and updated buffer 7
        expect(state.context.buffers[7].content).toBe('HELLO');

        // 3. Verify: Output reacted (via Transformer signal) and updated buffer 8
        expect(state.context.buffers[8].content).toBe('HELLO');

        // 4. Verify: Only ONE Trace generated (from the trigger buffer, Executor #5)
        // Bootstrap (1) + Setup (2) + Dispatch (3)
        expect(state.traceStack.length).toBe(3);
        expect(state.traceStack[2].metaBufferId).toBe(5);

        // 5. Verify: Aggregated delta contains all changes
        const tracePatch = state.traceStack[2].delta.patch;
        expect(tracePatch['buffers.7.content']).toBe('HELLO');
        expect(tracePatch['buffers.8.content']).toBe('HELLO');
        expect(tracePatch.run_status).toBe('REQUESTED');
    });

    it('should correctly reconstruct state using Time-Travel', () => {
        // 1. Initial structural change
        state = Runtime.setContext(state, { ...state.context, run_command: 'ACTIVATE' });
        state = Runtime.dispatch(state, 5).state; // Trace 3

        expect(state.context.buffers[7].content).toBe('HELLO');

        // 2. Perform Time-Travel back to Setup (Trace ID 2)
        const recResult = Runtime.reconstructState(state, 2);
        expect(recResult.ok).toBe(true);

        const pastState = recResult.value;
        expect(pastState.buffers[7].content).toBe('');
        expect(pastState.buffers[8].content).toBe('');
        expect(pastState.js_source_code).toBe('hello');
    });
});
