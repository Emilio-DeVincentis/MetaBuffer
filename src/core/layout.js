// @ts-check

/**
 * @typedef {Object} LayoutPane
 * @property {number} bufferId - ID of the MetaBuffer.
 * @property {number} flex - Flex weight for the pane.
 */

/**
 * @typedef {Object} LayoutView
 * @property {string} type - Layout type (e.g., 'linear').
 * @property {string} direction - Layout direction (e.g., 'horizontal').
 * @property {LayoutPane[]} panes - List of visible panes.
 */

/**
 * Pure function to calculate the layout view based on context.
 * @param {Readonly<Record<string, any>>} context
 * @returns {LayoutView}
 */
export function renderLayout(context) {
  const activeBuffers = Array.isArray(context.active_buffers) ? context.active_buffers : [];
  const focusStack = Array.isArray(context.focus_stack) ? context.focus_stack : [];

  const focusedBufferId = focusStack.length > 0 ? focusStack[focusStack.length - 1] : null;

  // Linear tiling (Niri-style): ordered by their presence in active_buffers,
  // but we could also order them by focus if desired. Let's stick to active_buffers
  // order but determine flex by focus.
  const panes = activeBuffers.map(bufferId => ({
    bufferId,
    flex: bufferId === focusedBufferId ? 3 : 1
  }));

  return {
    type: 'linear',
    direction: 'horizontal',
    panes
  };
}
