import { describe, it, expect, beforeEach } from 'vitest';
import { MetaBufferRuntime } from '../src/core/MetaBufferRuntime.js';

describe('MetaBufferRuntime - Reconstruction & Rollback', () => {
  let runtime;

  beforeEach(() => {
    runtime = new MetaBufferRuntime({ snapshotInterval: 2 });
    runtime.initialize(); // Trace ID 1

    runtime.registerBuffer({
      id: 2,
      scope: ['val'],
      apply: (view) => ({ delta: { patch: { val: (view.state.val || 0) + 1 } }, trace: { id: 0, metaBufferId: 2, parentTraceId: null, scope: [] } })
    });
  });

  it('should take snapshots at the specified interval', () => {
    runtime.dispatch(2); // Trace ID 2 -> Snapshot taken (id 2)
    runtime.dispatch(2); // Trace ID 3
    runtime.dispatch(2); // Trace ID 4 -> Snapshot taken (id 4)

    const snapshots = runtime.exportSnapshots();
    expect(snapshots.has(2)).toBe(true);
    expect(snapshots.has(4)).toBe(true);
    expect(snapshots.get(2).val).toBe(1);
    expect(snapshots.get(4).val).toBe(3);
  });

  it('should reconstruct state using snapshots', () => {
    runtime.dispatch(2); // ID 2
    runtime.dispatch(2); // ID 3
    runtime.dispatch(2); // ID 4
    runtime.dispatch(2); // ID 5

    const result = runtime.reconstructState(3);
    expect(result.ok).toBe(true);
    expect(result.value.val).toBe(2);
  });

  it('should rollback to a previous trace correctly', () => {
    runtime.dispatch(2); // ID 2
    runtime.dispatch(2); // ID 3
    runtime.dispatch(2); // ID 4

    expect(runtime.getContext().val).toBe(3);

    const result = runtime.rollback(2);
    expect(result.ok).toBe(true);
    expect(runtime.getContext().val).toBe(1);
    expect(runtime.getTraceStack().length).toBe(2);
  });

  it('should deep freeze snapshots', () => {
      runtime.dispatch(2); // ID 2 -> Snapshot
      const snapshots = runtime.exportSnapshots();
      const snap = snapshots.get(2);
      expect(Object.isFrozen(snap)).toBe(true);
  });
});
