// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/** @type {MetaBuffer} */
export const spatialInspectorBuffer = {
  id: 6,
  parentId: 1, // Child of Root
  scope: [
    'buffers',
    'focused_buffer_id',
    'focus_stack'
  ],
  apply: (view) => {
    // Spatial Inspector is read-only regarding other buffers.
    // It could write its own internal state if needed, but for MVP
    // it just provides a view.
    return { delta: { patch: {} }, trace: null };
  }
};
