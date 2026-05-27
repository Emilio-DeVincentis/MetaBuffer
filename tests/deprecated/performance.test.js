import { describe, it, expect, beforeEach } from 'vitest';
import * as Runtime from '../src/core/MetaBufferRuntime.js';
import { exportState } from '../src/core/serialization.js';

describe('MetaBuffer System - Performance Regression Tests', () => {
    let state;

    beforeEach(() => {
        state = Runtime.createInitialState({ snapshotInterval: 100 });
        state = Runtime.initialize(state).state;
        state = Runtime.registerBuffer(state, {
            id: 2,
            scope: ['counter'],
            apply: (view) => ({
                delta: { patch: { counter: (/** @type {number} */ (view.state.counter) || 0) + 1 } },
                trace: { id: 0, metaBufferId: 2, parentTraceId: null, scope: ['counter'] }
            })
        });
    });

    it('should reconstruct state within 100ms after 1000 traces', () => {
        for (let i = 0; i < 1000; i++) {
            state = Runtime.dispatch(state, 2).state;
        }

        const start = performance.now();
        const result = Runtime.reconstructState(state, 500);
        const end = performance.now();

        expect(result.ok).toBe(true);
        expect(end - start).toBeLessThan(100);
    });

    it('should serialize 5MB state within 200ms', () => {
        const largeData = 'x'.repeat(5 * 1024 * 1024);
        state = Runtime.setContext(state, { ...state.context, bloat: largeData });

        const start = performance.now();
        const blob = exportState(state);
        const end = performance.now();

        expect(blob.length).toBeGreaterThan(5 * 1024 * 1024);
        expect(end - start).toBeLessThan(200);
    });

    it('should maintain stable memory growth (< 50MB per 1000 ops)', () => {
        const memStart = process.memoryUsage().heapUsed;

        for (let i = 0; i < 1000; i++) {
            state = Runtime.dispatch(state, 2).state;
        }

        const memEnd = process.memoryUsage().heapUsed;
        const growthMB = (memEnd - memStart) / 1024 / 1024;

        expect(growthMB).toBeLessThan(50);
    });
});
