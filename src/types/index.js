// @ts-check

/**
 * @typedef {Object} Trace
 * @property {number} id - Unique identifier for the trace.
 * @property {number} metaBufferId - ID of the MetaBuffer that generated the trace.
 * @property {number|null} parentTraceId - ID of the preceding trace in the control stack.
 * @property {string[]} scope - The scope declared by the MetaBuffer at the time of trace emission.
 * @property {ContextDelta|null} [delta] - The state change associated with this trace (for reconstruction).
 */

/**
 * @typedef {Object} Signal
 * @property {string} kind - The type of signal.
 * @property {number|null} [target] - The ID of the buffer this signal is intended for.
 * @property {unknown} [payload] - Optional data payload.
 */

/**
 * @typedef {Object} ContextDelta
 * @property {Record<string, string | number | boolean | Array<unknown> | Record<string, unknown> | null>} patch - A partial update to the context state.
 * @property {Signal[]} [signals] - Intentions emitted by the buffer to trigger reactions in others.
 */

/**
 * @typedef {Object} ContextView
 * @property {Readonly<Record<string, string | number | boolean | Array<unknown> | Record<string, unknown> | null>>} state - A read-only view of the context, limited by scope.
 * @property {Signal[]} [incomingSignals] - Signals received from other buffers in the same dispatch.
 */

/**
 * @typedef {Object} MetaBuffer
 * @property {number} id - Unique identifier for the MetaBuffer.
 * @property {number|null} parentId - ID of the parent MetaBuffer (genealogical reference).
 * @property {string[]} scope - Array of context keys this MetaBuffer is allowed to access.
 * @property {(view: ContextView) => { delta: ContextDelta, trace: Trace|null }} apply -
 *           The transition function. Pure logic that returns a delta and optionally a trace.
 */

/**
 * @typedef {'IDLE' | 'REQUESTED' | 'ERROR'} AgentStatus
 */

/**
 * @typedef {'IDLE' | 'REQUESTED' | 'ERROR'} RunStatus
 */

/**
 * @typedef {Object} OutputChunk
 * @property {'stdout' | 'stderr' | 'exit'} type - The type of output.
 * @property {string} [text] - The content of the chunk.
 * @property {number} [code] - The exit code (only for exit type).
 */

/**
 * @typedef {Object} Suggestion
 * @property {string} id - Unique identifier for the suggestion.
 * @property {'edit' | 'info'} kind - The type of suggestion.
 * @property {{ from: number, to: number }} [range] - For edits, the range to replace.
 * @property {string} [replacement] - For edits, the new content.
 * @property {string} explanation - Human-readable explanation.
 */

/**
 * @typedef {Object} KernelError
 * @property {string} code - Machine-readable error code.
 * @property {string} message - Human-readable error message.
 * @property {number} [bufferId] - ID of the MetaBuffer that caused the error.
 */

/**
 * @typedef {Object} ExecutionResult
 * @property {boolean} ok - Indicates if the execution was successful.
 * @property {boolean} [success] - Alias for ok (for backward compatibility or preference).
 * @property {unknown} [value] - Optional return value on success.
 * @property {unknown} [data] - Alias for value.
 * @property {KernelError} [error] - Error details on failure.
 */

export {};
