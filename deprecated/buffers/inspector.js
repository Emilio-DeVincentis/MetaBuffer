// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/** @type {MetaBuffer} */
export const spatialInspectorBuffer = {
  id: 6,
  parentId: 1, // Child of Root
  scope: [
    'active_buffers',
    'buffers',
    'focused_buffer_id',
    'focus_stack',
    'inspector_state'
  ],
  apply: (view) => {
    const buffers = view.state.buffers ? Object.values(view.state.buffers) : [];
    const activeBuffers = Array.isArray(view.state.active_buffers) ? view.state.active_buffers : [];
    const focusStack = Array.isArray(view.state.focus_stack) ? view.state.focus_stack : [];
    const focusedId = view.state.focused_buffer_id;

    const patch = {
      inspector_state: {
        totalBuffers: buffers.length,
        activeCount: activeBuffers.length,
        focusedId: focusedId,
        focusHistory: focusStack.slice(-10) // Last 10
      }
    };

    return { delta: { patch }, trace: null };
  }
};
