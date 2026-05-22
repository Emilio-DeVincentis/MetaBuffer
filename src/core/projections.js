// @ts-check

/**
 * Mock observers (projections) that extract data for impure devices.
 */

/**
 * Project code for CodeMirror.
 * @param {Readonly<Record<string, any>>} context
 * @returns {string}
 */
export function projectCode(context) {
  return context.js_source_code || '';
}

/**
 * Project output for xterm.js.
 * @param {Readonly<Record<string, any>>} context
 * @returns {any[]}
 */
export function projectTerminal(context) {
  return Array.isArray(context.runtime_output) ? context.runtime_output : [];
}

/**
 * Project diagnostics for the info panel.
 * @param {Readonly<Record<string, any>>} context
 * @returns {Record<string, any>}
 */
export function projectDiagnostics(context) {
  return context.diagnostics || {};
}

/**
 * Project suggestions for the agent panel.
 * @param {Readonly<Record<string, any>>} context
 * @returns {Record<string, any>}
 */
export function projectSuggestions(context) {
  return context.suggestions || {};
}
