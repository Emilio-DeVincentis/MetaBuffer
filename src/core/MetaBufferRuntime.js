// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */
/** @typedef {import('../types/index.js').Trace} Trace */
/** @typedef {import('../types/index.js').ContextView} ContextView */
/** @typedef {import('../types/index.js').ContextDelta} ContextDelta */
/** @typedef {import('../types/index.js').ExecutionResult} ExecutionResult */
/** @typedef {import('../types/index.js').KernelError} KernelError */

export class MetaBufferRuntime {
  constructor() {
    /** @type {Map<number, MetaBuffer>} */
    this.buffers = new Map();

    /** @type {Record<string, unknown>} */
    this.context = {};

    /** @type {Trace[]} */
    this.traceStack = [];

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
   * Initializes the system and emits the mandatory BOOTSTRAP Trace.
   * @returns {ExecutionResult}
   */
  initialize() {
    try {
      /** @type {Trace} */
      const bootstrapTrace = {
        id: this.nextTraceId++,
        metaBufferId: 1, // Root MetaBuffer ID
        parentTraceId: null,
        scope: ['*'] // System-level bootstrap scope
      };
      this.traceStack.push(bootstrapTrace);
      return { ok: true };
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
      const { delta, trace } = buffer.apply(view);

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
        newTrace = {
          ...trace,
          id: this.nextTraceId++,
          metaBufferId: buffer.id,
          parentTraceId: parentTrace ? parentTrace.id : null,
          scope: [...buffer.scope]
        };
      }

      // 4. Commit State and Trace (Atomic Step)
      for (const key in validPatch) {
        this.context[key] = validPatch[key];
      }
      if (newTrace) {
        this.traceStack.push(newTrace);
      }

      return { ok: true };
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
}
