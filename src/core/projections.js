// @ts-check

/**
 * Mock observers (projections) that extract data for impure devices.
 */

/**
 * Project code for CodeMirror.
 * @param {Readonly<Record<string, unknown>>} context
 * @returns {string}
 */
export function projectCode(context) {
  if (context.focused_buffer_id && context.buffers) {
      const buffer = context.buffers[context.focused_buffer_id];
      if (buffer && buffer.kind === 'editor') {
          return buffer.content || '';
      }
  }
  return context.js_source_code || '';
}

/**
 * Projects all workspace buffers.
 * @param {Readonly<Record<string, unknown>>} context
 * @returns {import('../types/index.js').MetaBuffer[]}
 */
export function projectWorkspace(context) {
    if (!context.buffers) return [];
    return Object.values(context.buffers).filter(b => b.kind === 'editor' || b.kind === 'inspector');
}

/** @typedef {import('../types/index.js').OutputChunk} OutputChunk */
/** @typedef {import('../types/index.js').Suggestion} Suggestion */

/**
 * Project output for xterm.js.
 * @param {Readonly<Record<string, unknown>>} context
 * @returns {OutputChunk[]}
 */
export function projectTerminal(context) {
  return Array.isArray(context.runtime_output) ? context.runtime_output : [];
}

/**
 * Project diagnostics for the info panel.
 * @param {Readonly<Record<string, unknown>>} context
 * @returns {Record<string, string[]>}
 */
export function projectDiagnostics(context) {
  return context.diagnostics || {};
}

/**
 * Project spatial inspector data.
 * @param {Readonly<Record<string, unknown>>} context
 * @returns {Record<string, unknown> | null}
 */
export function projectInspector(context) {
    return context.inspector_state || null;
}

/**
 * Project suggestions for the agent panel.
 * @param {Readonly<Record<string, unknown>>} context
 * @returns {Record<string, Suggestion[]>}
 */
export function projectSuggestions(context) {
  return context.suggestions || {};
}
