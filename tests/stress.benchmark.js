// @ts-check
import * as Runtime from '../src/core/MetaBufferRuntime.js';

/**
 * MetaBuffer System - Phase 7 Stress Benchmark
 */
async function runBenchmark() {
  console.log('--- MetaBuffer System Phase 7 Stress Benchmark ---');
  console.log('Target: 100,000 Structural Dispatches');

  const snapshotInterval = 100;
  let state = Runtime.createInitialState({ snapshotInterval });
  state = Runtime.initialize(state).state;

  const numBuffers = 100;
  const numDispatches = 100000;

  // 1. Register buffer pool
  for (let i = 2; i <= numBuffers + 1; i++) {
    state = Runtime.registerBuffer(state, {
      id: i,
      // Each buffer has its own private key to avoid Root/Global conflicts
      scope: [`buffer_${i}_state`],
      apply: (view) => {
          const key = `buffer_${i}_state`;
          return {
            delta: {
                patch: {
                    [key]: (/** @type {number} */ (view.state[key]) || 0) + 1
                }
            },
            trace: { id: 0, metaBufferId: i, parentTraceId: null, scope: [key] }
          };
      }
    });
  }

  const startMemory = process.memoryUsage().heapUsed;
  const startTime = Date.now();

  console.log(`Starting execution... (Heap: ${(startMemory / 1024 / 1024).toFixed(2)} MB)`);

  // 2. Heavy dispatch load
  for (let i = 1; i <= numDispatches; i++) {
    const bufferId = (i % numBuffers) + 2;
    const result = Runtime.dispatch(state, bufferId);

    if (!result.ok) {
        console.error(`Dispatch failed at ${i}:`, result.error);
        process.exit(1);
    }

    state = result.state;

    if (i % 20000 === 0) {
        const lapTime = Date.now() - startTime;
        const currentMemory = process.memoryUsage().heapUsed;
        console.log(`Progress: ${i} dispatches... | Time: ${lapTime}ms | Heap: ${(currentMemory / 1024 / 1024).toFixed(2)} MB | Avg: ${(lapTime / i).toFixed(4)} ms/op`);
    }
  }

  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;

  console.log('\n--- Final Metrics ---');
  console.log(`Total Time: ${endTime - startTime}ms`);
  console.log(`Avg Time per Dispatch: ${((endTime - startTime) / numDispatches).toFixed(4)}ms`);
  console.log(`Memory Usage (Start): ${(startMemory / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Memory Usage (End): ${(endMemory / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Memory Growth: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Trace Stack Size: ${state.traceStack.length}`);
  console.log(`Snapshots Stored: ${state.snapshots.size}`);

  // 3. Performance of Reconstruction at scale
  const recStartTime = Date.now();
  const targetId = Math.floor(numDispatches / 2);
  const recResult = Runtime.reconstructState(state, targetId);
  const recEndTime = Date.now();

  console.log(`\nReconstruction of Trace ${targetId} took: ${recEndTime - recStartTime}ms`);
  if (!recResult.ok) {
    console.error('Reconstruction failed:', recResult.error);
  } else {
    console.log('Reconstruction verified successful.');
  }

  if (global.gc) {
    global.gc();
    console.log(`Memory after GC: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`);
  }
}

runBenchmark().catch(console.error);
