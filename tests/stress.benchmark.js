// @ts-check
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';

async function runBenchmark() {
  console.log('--- MetaBuffer System Stress Test ---');

  const snapshotInterval = 100;
  const runtime = new MetaBufferRuntime({ snapshotInterval });
  runtime.initialize();

  const numBuffers = 1000; // Scaled down slightly for sandbox speed, but still significant
  const numDispatches = 10000;

  // 1. Register many buffers
  for (let i = 2; i <= numBuffers + 1; i++) {
    runtime.registerBuffer({
      id: i,
      scope: ['count', 'data'],
      apply: (view) => ({
        delta: { patch: { count: (/** @type {number} */ (view.state.count) || 0) + 1, data: `buffer-${i}` } },
        trace: { id: 0, metaBufferId: i, parentTraceId: null, scope: [] }
      })
    });
  }

  const startMemory = process.memoryUsage().heapUsed;
  const startTime = Date.now();

  // 2. Heavy dispatch load
  for (let i = 0; i < numDispatches; i++) {
    const bufferId = (i % numBuffers) + 2;
    runtime.dispatch(bufferId);

    if (i > 0 && i % 2000 === 0) {
        const lapTime = Date.now() - startTime;
        console.log(`Progress: ${i} dispatches... (${(lapTime / i).toFixed(4)} ms/op)`);
    }
  }

  const endTime = Date.now();
  const endMemory = process.memoryUsage().heapUsed;

  console.log('\n--- Metrics ---');
  console.log(`Total Time: ${endTime - startTime}ms`);
  console.log(`Avg Time per Dispatch: ${(endTime - startTime) / numDispatches}ms`);
  console.log(`Memory Usage (Start): ${(startMemory / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Memory Usage (End): ${(endMemory / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Memory Growth: ${((endMemory - startMemory) / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Trace Stack Size: ${runtime.getTraceStack().length}`);
  console.log(`Snapshots Stored: ${runtime.exportSnapshots().size}`);

  // 3. Reconstruction test under load
  const recStartTime = Date.now();
  const targetId = numDispatches / 2;
  const recResult = runtime.reconstructState(targetId);
  const recEndTime = Date.now();

  console.log(`\nReconstruction of Trace ${targetId} took: ${recEndTime - recStartTime}ms`);
  if (recResult.ok) {
    console.log('Reconstruction successful.');
  }

  // 4. Cleanup & GC Verification
  if (global.gc) {
    console.log('\nInvoking GC...');
    global.gc();
    const afterGCMemory = process.memoryUsage().heapUsed;
    console.log(`Memory after GC: ${(afterGCMemory / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log('\nGC not exposed. Run with --expose-gc for full certification.');
  }
}

runBenchmark().catch(console.error);
