import { describe, it, expect, beforeEach } from 'vitest';
import * as Runtime from '../src/core/MetaBufferRuntime.js';

describe('MetaBuffer Edge Cases', () => {
    let state;

    beforeEach(() => {
        state = Runtime.createInitialState();
    });

    it('should reconstruct state for BOOTSTRAP Trace (ID: 1)', () => {
        const initRes = Runtime.initialize(state);
        state = initRes.state;

        // Trace 1 exists (BOOTSTRAP)
        expect(state.traceStack.length).toBe(1);
        expect(state.traceStack[0].id).toBe(1);

        const result = Runtime.reconstructState(state, 1);
        expect(result.ok).toBe(true);
        // Initial state should be empty context {} unless we set something before initialize
        expect(result.value).toEqual({});
    });

    it('should handle signal routing with multiple targets and broadcast', () => {
        // Register 3 buffers
        const root = { id: 1, parentId: null, scope: ['*'], apply: (v) => ({ delta: { patch: {}, signals: v.incomingSignals }, trace: null }) };
        const b2 = { id: 2, parentId: 1, scope: ['b2'], apply: (v) => ({ delta: { patch: { b2: v.incomingSignals.length } }, trace: null }) };
        const b3 = { id: 3, parentId: 1, scope: ['b3'], apply: (v) => ({ delta: { patch: { b3: v.incomingSignals.length } }, trace: null }) };

        state = Runtime.registerBuffer(state, root);
        state = Runtime.registerBuffer(state, b2);
        state = Runtime.registerBuffer(state, b3);
        state = Runtime.initialize(state).state;

        // Trigger buffer 1 to emit signals
        const triggerBuffer = {
            id: 1,
            parentId: null,
            scope: ['*'],
            apply: () => ({
                delta: {
                    patch: {},
                    signals: [
                        { kind: 'TO_B2', target: 2 },
                        { kind: 'BROADCAST', target: null }
                    ]
                },
                trace: {}
            })
        };
        state = Runtime.registerBuffer(state, triggerBuffer);

        const result = Runtime.dispatch(state, 1);
        expect(result.ok).toBe(true);
        const context = result.state.context;

        // Buffer 2 should have received 2 signals (TO_B2 + BROADCAST)
        expect(context.b2).toBe(2);
        // Buffer 3 should have received 1 signal (BROADCAST)
        expect(context.b3).toBe(1);
    });

    it('Performance: Dispatch with 1000 MetaBuffers', () => {
        state = Runtime.initialize(state).state;
        const root = { id: 1, parentId: null, scope: ['*'], apply: () => ({ delta: { patch: {} }, trace: null }) };
        state = Runtime.registerBuffer(state, root);

        for (let i = 2; i <= 1001; i++) {
            state = Runtime.registerBuffer(state, {
                id: i,
                parentId: 1,
                scope: [`key_${i}`],
                apply: (v) => ({
                    delta: { patch: { [`key_${i}`]: v.incomingSignals.length } },
                    trace: null
                })
            });
        }

        const start = performance.now();
        const result = Runtime.dispatch(state, 1);
        const end = performance.now();

        expect(result.ok).toBe(true);
        console.log(`Dispatch with 1000 buffers took: ${(end - start).toFixed(2)}ms`);
        // Target < 250ms for 1000 buffers in CI/CD environment
        expect(end - start).toBeLessThan(250);
    });
});
