// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */
/** @typedef {import('../types/index.js').Trace} Trace */
/** @typedef {import('../types/index.js').ContextView} ContextView */
/** @typedef {import('../types/index.js').ContextDelta} ContextDelta */
/** @typedef {import('../types/index.js').ExecutionResult} ExecutionResult */
/** @typedef {import('../types/index.js').KernelError} KernelError */

export class MetaBufferRuntime {
  /**
   * @param {Object} [options]
   * @param {number} [options.snapshotInterval] - Interval between structural snapshots.
   * @param {Map<number, Record<string, unknown>>} [options.initialSnapshots] - Pre-hydrated snapshots.
   */
  constructor(options = {}) {
    /** @type {Map<number, MetaBuffer>} */
    this.buffers = new Map();

    /** @type {Record<string, unknown>} */
    this.context = {};

    /** @type {Trace[]} */
    this.traceStack = [];

    /** @type {Map<number, Record<string, unknown>>} */
    this.snapshots = options.initialSnapshots || new Map();

    /** @type {number} */
    this.snapshotInterval = options.snapshotInterval || 50;

    /** @private */
    this.nextTraceId = 1;
  }

  /**
   * Registers a MetaBuffer in the runtime.
   * @param {MetaBuffer} buffer
   */
  registerBuffer(buffer) {
    this.buffers.set(buffer.id, buffer);
  }

  /**
   * Sets initial context values.
   * @param {Record<string, unknown>} initialContext
   */
  setContext(initialContext) {
    this.context = { ...initialContext };
  }

  /**
   * Internal helper for recursive deep freeze.
   * @param {any} obj
   * @returns {any}
   * @private
   */
  _deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach((prop) => {
      if (
        Object.prototype.hasOwnProperty.call(obj, prop) &&
        obj[prop] !== null &&
        (typeof obj[prop] === 'object' || typeof obj[prop] === 'function') &&
        !Object.isFrozen(obj[prop])
      ) {
        this._deepFreeze(obj[prop]);
      }
    });
    return obj;
  }

  /**
   * Initializes the system and emits the mandatory BOOTSTRAP Trace.
   * @returns {ExecutionResult}
   */
  initialize() {
    try {
      /** @type {Trace} */
      const bootstrapTrace = this._deepFreeze({
        id: this.nextTraceId++,
        metaBufferId: 1, // Root MetaBuffer ID
        parentTraceId: null,
        scope: ['*'],
        delta: null
      });
      this.traceStack.push(bootstrapTrace);
      return { ok: true, success: true };
    } catch (e) {
      return {
        ok: false,
        error: {
          code: 'BOOTSTRAP_FAILURE',
          message: e instanceof Error ? e.message : 'Unknown bootstrap error'
        }
      };
    }
  }

  /**
   * Dispatches a transition for a specific MetaBuffer.
   * @param {number} bufferId
   * @returns {ExecutionResult}
   */
  dispatch(bufferId) {
    try {
      const buffer = this.buffers.get(bufferId);
      if (!buffer) {
        return {
          ok: false,
          error: { code: 'BUFFER_NOT_FOUND', message: `MetaBuffer with ID ${bufferId} not found.` }
        };
      }

      // 1. Prepare ContextView (Scope Isolation & Structural Sharing by contract)
      /** @type {Record<string, unknown>} */
      const viewState = {};
      for (const key of buffer.scope) {
        if (Object.prototype.hasOwnProperty.call(this.context, key)) {
          viewState[key] = this.context[key];
        }
      }

      /** @type {ContextView} */
      const view = { state: Object.freeze(viewState) };

      // 2. Apply MetaBuffer logic (Protective Execution)
      const result = buffer.apply(view);
      const delta = result.delta;
      const trace = result.trace;

      // 3. Atomicity: Prepare patch and trace before committing
      /** @type {Record<string, unknown>} */
      const validPatch = {};
      if (delta && delta.patch) {
        for (const key in delta.patch) {
          if (buffer.scope.includes(key)) {
            validPatch[key] = delta.patch[key];
          } else {
            console.warn(`MetaBuffer ${bufferId} attempted to write out-of-scope key: ${key}`);
          }
        }
      }

      /** @type {Trace | null} */
      let newTrace = null;
      if (trace) {
        const parentTrace = this.traceStack[this.traceStack.length - 1] || null;
        newTrace = this._deepFreeze({
          ...trace,
          id: this.nextTraceId++,
          metaBufferId: buffer.id,
          parentTraceId: parentTrace ? parentTrace.id : null,
          scope: [...buffer.scope],
          delta: { patch: { ...validPatch } } // Capture delta for reconstruction
        });
      }

      // 4. Commit State and Trace (Atomic Step)
      for (const key in validPatch) {
        this.context[key] = validPatch[key];
      }

      if (newTrace) {
        this.traceStack.push(newTrace);

        // 5. Snapshot logic: Every X structural traces
        const structuralTraceCount = this.traceStack.length;
        if (structuralTraceCount % this.snapshotInterval === 0) {
          this.snapshots.set(newTrace.id, this._deepFreeze({ ...this.context }));
        }
      }

      return { ok: true, success: true };
    } catch (e) {
      return {
        ok: false,
        error: {
          code: 'DISPATCH_FAILURE',
          message: e instanceof Error ? e.message : 'Unknown dispatch error',
          bufferId
        }
      };
    }
  }

  /**
   * Returns the current trace stack (read-only).
   * @returns {ReadonlyArray<Trace>}
   */
  getTraceStack() {
    return Object.freeze([...this.traceStack]);
  }

  /**
   * Returns the current context (read-only).
   * @returns {Readonly<Record<string, unknown>>}
   */
  getContext() {
    return Object.freeze({ ...this.context });
  }

  /**
   * Reconstructs the state from Traces, starting from the nearest snapshot.
   * @param {number} targetTraceId
   * @returns {ExecutionResult}
   */
  reconstructState(targetTraceId) {
    try {
      // 1. Find nearest snapshot <= targetTraceId
      let currentState = {};
      let startTraceIndex = 0;

      const snapshotTraceIds = Array.from(this.snapshots.keys())
        .filter((id) => id <= targetTraceId)
        .sort((a, b) => b - a);

      if (snapshotTraceIds.length > 0) {
        const nearestSnapshotId = snapshotTraceIds[0];
        currentState = { ...this.snapshots.get(nearestSnapshotId) };
        startTraceIndex = this.traceStack.findIndex((t) => t.id === nearestSnapshotId) + 1;
      }

      // 2. Replay traces from that point
      for (let i = startTraceIndex; i < this.traceStack.length; i++) {
        const trace = this.traceStack[i];
        if (trace.id > targetTraceId) break;

        if (trace.delta && trace.delta.patch) {
          currentState = { ...currentState, ...trace.delta.patch };
        }
      }

      return { ok: true, success: true, value: currentState, data: currentState };
    } catch (e) {
      return {
        ok: false,
        success: false,
        error: {
          code: 'RECONSTRUCTION_FAILURE',
          message: e instanceof Error ? e.message : 'Unknown reconstruction error'
        }
      };
    }
  }

  /**
   * Performs a rollback to a target Trace ID.
   * @param {number} targetTraceId
   * @returns {ExecutionResult}
   */
  rollback(targetTraceId) {
    const result = this.reconstructState(targetTraceId);
    if (!result.ok) return result;

    this.context = { .../** @type {Record<string, unknown>} */ (result.value) };
    const targetIndex = this.traceStack.findIndex((t) => t.id === targetTraceId);
    if (targetIndex !== -1) {
      this.traceStack = this.traceStack.slice(0, targetIndex + 1);
    }

    return { ok: true, success: true };
  }

  /**
   * Exports all current snapshots (read-only).
   * @returns {ReadonlyMap<number, Record<string, unknown>>}
   */
  exportSnapshots() {
    return new Map(this.snapshots);
  }
}
