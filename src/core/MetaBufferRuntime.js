// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */
/** @typedef {import('../types/index.js').Trace} Trace */
/** @typedef {import('../types/index.js').ContextView} ContextView */
/** @typedef {import('../types/index.js').ContextDelta} ContextDelta */

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
   */
  initialize() {
    /** @type {Trace} */
    const bootstrapTrace = {
      id: this.nextTraceId++,
      metaBufferId: 1, // Root MetaBuffer ID
      parentTraceId: null,
      scope: ['*'] // System-level bootstrap scope
    };
    this.traceStack.push(bootstrapTrace);
  }

  /**
   * Dispatches a transition for a specific MetaBuffer.
   * @param {number} bufferId
   */
  dispatch(bufferId) {
    const buffer = this.buffers.get(bufferId);
    if (!buffer) {
      throw new Error(`MetaBuffer with ID ${bufferId} not found.`);
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

    // 2. Apply MetaBuffer logic
    const { delta, trace } = buffer.apply(view);

    // 3. Enforce Scope on Delta
    if (delta && delta.patch) {
      for (const key in delta.patch) {
        if (buffer.scope.includes(key)) {
          this.context[key] = delta.patch[key];
        } else {
          // Silently discard out-of-scope writes
          console.warn(`MetaBuffer ${bufferId} attempted to write out-of-scope key: ${key}`);
        }
      }
    }

    // 4. Handle Trace (Control Tracking)
    if (trace) {
      const parentTrace = this.traceStack[this.traceStack.length - 1] || null;

      /** @type {Trace} */
      const newTrace = {
        ...trace,
        id: this.nextTraceId++,
        metaBufferId: buffer.id,
        parentTraceId: parentTrace ? parentTrace.id : null,
        scope: [...buffer.scope]
      };

      this.traceStack.push(newTrace);
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
