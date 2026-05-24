// @ts-check
import * as Runtime from '../src/core/MetaBufferRuntime.js';
import { exportState } from '../src/core/serialization.js';

async function runPerformanceBenchmarks() {
    console.log('=== MetaBuffer System Performance Benchmarks ===\n');

    const snapshotInterval = 100;
    let state = Runtime.createInitialState({ snapshotInterval });
    state = Runtime.initialize(state).state;

    // 1. Register a dummy buffer for dispatches
    state = Runtime.registerBuffer(state, {
        id: 2,
        scope: ['counter'],
        apply: (view) => ({
            delta: { patch: { counter: (/** @type {number} */ (view.state.counter) || 0) + 1 } },
            trace: { id: 0, metaBufferId: 2, parentTraceId: null, scope: ['counter'] }
        })
    });

    // 2. Measure Time-Travel speed (1000+ traces)
    console.log('--- 1. Time-Travel Speed ---');
    const numOps = 2000;
    for (let i = 0; i < numOps; i++) {
        state = Runtime.dispatch(state, 2).state;
    }
    console.log(`Generated ${state.traceStack.length} traces.`);

    const targetTraceId = 1500;
    const ttStart = performance.now();
    const ttResult = Runtime.reconstructState(state, targetTraceId);
    const ttEnd = performance.now();
    const ttDuration = ttEnd - ttStart;
    console.log(`Reconstruction of Trace ${targetTraceId} took: ${ttDuration.toFixed(2)}ms`);
    console.log(`Status: ${ttDuration < 100 ? 'PASS' : 'FAIL'} (< 100ms)\n`);

    // 3. Edit responsiveness: Type 100 chars
    console.log('--- 2. Edit Responsiveness (Simulated) ---');
    // Simulated "Editor" buffer that does more work
    state = Runtime.registerBuffer(state, {
        id: 3,
        scope: ['text', 'analysis'],
        apply: (view) => {
            const text = view.state.text || '';
            // Simulating some "heavy" analysis on each character
            const analysis = String(text).split('').reverse().join('');
            return {
                delta: { patch: { text: text + 'a', analysis } },
                trace: null // Typing doesn't produce trace
            };
        }
    });

    const editStart = performance.now();
    const numChars = 100;
    for (let i = 0; i < numChars; i++) {
        state = Runtime.dispatch(state, 3).state;
    }
    const editEnd = performance.now();
    const avgLatency = (editEnd - editStart) / numChars;
    console.log(`Average render latency per char: ${avgLatency.toFixed(2)}ms`);
    console.log(`Status: ${avgLatency < 50 ? 'PASS' : 'FAIL'} (< 50ms)\n`);

    // 4. Persistence write time: Serialize 5MB state
    console.log('--- 3. Persistence Write Time (5MB State) ---');
    // Bloat the context to ~5MB
    const largeData = 'x'.repeat(5 * 1024 * 1024);
    state = Runtime.setContext(state, { ...state.context, bloat: largeData });

    const pStart = performance.now();
    const blob = exportState(state);
    const pEnd = performance.now();
    const pDuration = pEnd - pStart;
    console.log(`Serialization of ${(blob.length / 1024 / 1024).toFixed(2)}MB took: ${pDuration.toFixed(2)}ms`);
    console.log(`Status: ${pDuration < 200 ? 'PASS' : 'FAIL'} (< 200ms)\n`);

    // 5. Memory profile: Long session
    console.log('--- 4. Memory Profile (Long Session) ---');
    // Manual trigger of GC if available (not usually in standard Node unless --expose-gc)
    const memStart = process.memoryUsage().heapUsed;

    const longSessionOps = 1000;
    for (let i = 0; i < longSessionOps; i++) {
        state = Runtime.dispatch(state, 2).state;
    }

    const memEnd = process.memoryUsage().heapUsed;
    const growth = (memEnd - memStart) / 1024 / 1024;
    console.log(`Memory growth after ${longSessionOps} operations: ${growth.toFixed(2)}MB`);
    console.log(`Status: ${growth < 50 ? 'PASS' : 'FAIL'} (arbitrary < 50MB for 1000 ops)\n`);

    console.log('=== Benchmark Complete ===');
}

runPerformanceBenchmarks().catch(console.error);
