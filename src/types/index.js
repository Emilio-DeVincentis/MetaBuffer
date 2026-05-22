// @ts-check

/**
 * @typedef {Object} Trace
 * @property {number} id - Unique identifier for the trace.
 * @property {number} metaBufferId - ID of the MetaBuffer that generated the trace.
 * @property {number|null} parentTraceId - ID of the preceding trace in the control stack.
 * @property {string[]} scope - The scope declared by the MetaBuffer at the time of trace emission.
 */

/**
 * @typedef {Object} ContextDelta
 * @property {Record<string, any>} patch - A partial update to the context state.
 */

/**
 * @typedef {Object} ContextView
 * @property {Readonly<Record<string, any>>} state - A read-only view of the context, limited by scope.
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
 * @typedef {Object} Suggestion
 * @property {string} id - Unique identifier for the suggestion.
 * @property {'edit' | 'info'} kind - The type of suggestion.
 * @property {{ from: number, to: number }} [range] - For edits, the range to replace.
 * @property {string} [replacement] - For edits, the new content.
 * @property {string} explanation - Human-readable explanation.
 */

export {};
