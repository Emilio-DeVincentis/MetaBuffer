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
   * Dispatches a transition for a specific MetaBuffer, triggering reactions.
   * @param {number} triggerBufferId
   * @returns {ExecutionResult}
   */
  dispatch(triggerBufferId) {
    try {
      const triggerBuffer = this.buffers.get(triggerBufferId);
      if (!triggerBuffer) {
        return {
          ok: false,
          error: { code: 'BUFFER_NOT_FOUND', message: `MetaBuffer with ID ${triggerBufferId} not found.` }
        };
      }

      // 1. Snapshot the initial state
      const snapshot = Object.freeze({ ...this.context });

      // 2. Initial Dispatch (Trigger)
      /** @type {ContextView} */
      const triggerView = {
          state: this._prepareViewState(triggerBuffer, snapshot),
          incomingSignals: [],
          // @ts-ignore
          isTrigger: true
      };
      const triggerResult = triggerBuffer.apply(triggerView);
      const triggerDelta = triggerResult.delta || { patch: {} };

      const triggerPatch = this._validatePatch(triggerBuffer, triggerDelta.patch);
      const aggregatedPatch = { ...triggerPatch };
      const emittedSignals = triggerDelta.signals || [];
      const primaryTrace = triggerResult.trace;

      // 3. Deterministic Reaction Pass
      const bufferIds = Array.from(this.buffers.keys()).sort((a, b) => a - b);
      for (const bufferId of bufferIds) {
        if (bufferId === triggerBufferId) continue;

        const buffer = this.buffers.get(bufferId);
        if (!buffer) continue;

        /** @type {ContextView} */
        const view = {
            state: this._prepareViewState(buffer, snapshot),
            incomingSignals: emittedSignals.filter(s => s.target === bufferId || s.target === null),
            // @ts-ignore
            isTrigger: false
        };

        const reactionResult = buffer.apply(view);
        const reactionDelta = reactionResult.delta;
        if (reactionDelta && reactionDelta.patch) {
            const reactionPatch = this._validatePatch(buffer, reactionDelta.patch);

            // Fail-fast conflict detection
            for (const key in reactionPatch) {
                if (Object.prototype.hasOwnProperty.call(aggregatedPatch, key)) {
                    return {
                        ok: false,
                        error: {
                            code: 'WRITE_CONFLICT',
                            message: `Conflict on key '${key}' between buffer ${triggerBufferId} and ${bufferId}`,
                            bufferId
                        }
                    };
                }
                aggregatedPatch[key] = reactionPatch[key];
            }
        }

        if (reactionDelta && reactionDelta.signals) {
            emittedSignals.push(...reactionDelta.signals);
        }
      }

      // 4. Atomicity: Prepare Trace (One trace per dispatch)
      /** @type {Trace | null} */
      let finalTrace = null;
      if (primaryTrace) {
        const parentTrace = this.traceStack[this.traceStack.length - 1] || null;
        finalTrace = this._deepFreeze({
          ...primaryTrace,
          id: this.nextTraceId++,
          metaBufferId: triggerBuffer.id,
          parentTraceId: parentTrace ? parentTrace.id : null,
          scope: [...triggerBuffer.scope],
          delta: { patch: aggregatedPatch }
        });
      }

      // 5. Atomic Commit
      const newContext = { ...this.context };
      for (const key in aggregatedPatch) {
          this._setContextValue(newContext, key, aggregatedPatch[key]);
      }
      this.context = newContext;

      if (finalTrace) {
        this.traceStack.push(finalTrace);

        // Snapshot logic: Every X structural traces
        const structuralTraceCount = this.traceStack.length;
        if (structuralTraceCount % this.snapshotInterval === 0) {
          this.snapshots.set(finalTrace.id, this._deepFreeze({ ...this.context }));
        }
      }

      return { ok: true, success: true };
    } catch (e) {
      return {
        ok: false,
        error: {
          code: 'DISPATCH_FAILURE',
          message: e instanceof Error ? e.message : 'Unknown dispatch error',
          bufferId: triggerBufferId
        }
      };
    }
  }

  /**
   * Helper to prepare isolated view state.
   * @private
   * @param {MetaBuffer} buffer
   * @param {Record<string, unknown>} snapshot
   */
  _prepareViewState(buffer, snapshot) {
      /** @type {Record<string, unknown>} */
      const viewState = {};
      for (const key of buffer.scope) {
          if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
              viewState[key] = snapshot[key];
          }
      }
      return Object.freeze(viewState);
  }

  /**
   * Helper to validate patch against scope.
   * @private
   * @param {MetaBuffer} buffer
   * @param {Record<string, unknown>} patch
   */
  _validatePatch(buffer, patch) {
      /** @type {Record<string, unknown>} */
      const validPatch = {};
      if (patch) {
          for (const key in patch) {
              const baseKey = key.split('.')[0];
              if (buffer.scope.includes(baseKey) || buffer.scope.includes('*')) {
                  validPatch[key] = patch[key];
              } else {
                  console.warn(`MetaBuffer ${buffer.id} attempted to write out-of-scope key: ${key}`);
              }
          }
      }
      return validPatch;
  }

  /**
   * Internal helper to set context value, supporting dot-notation.
   * @private
   * @param {Record<string, any>} context
   * @param {string} key
   * @param {any} value
   */
  _setContextValue(context, key, value) {
      if (key.includes('.')) {
          const parts = key.split('.');
          let curr = context;
          for (let i = 0; i < parts.length - 1; i++) {
              curr[parts[i]] = { ...curr[parts[i]] };
              curr = curr[parts[i]];
          }
          curr[parts[parts.length - 1]] = value;
      } else {
          context[key] = value;
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
