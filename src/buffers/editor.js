// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/** @type {MetaBuffer} */
export const editorBuffer = {
  id: 2,
  parentId: 1, // Root is the parent
  scope: [
    'buffers',
    'focused_buffer_id',
    'incoming_input',
    'needs_analysis',
    'js_source_code',
    'cursor_position'
  ],
  apply: (view) => {
    const patch = {};
    const input = view.state.incoming_input;
    const focusedId = view.state.focused_buffer_id;

    if (input !== null && input !== undefined) {
      if (focusedId && view.state.buffers) {
        const buffers = { ...view.state.buffers };
        const buffer = buffers[focusedId];

        if (buffer && buffer.kind === 'editor') {
            buffer.content = (buffer.content || '') + input;
            patch.buffers = buffers;
            patch.needs_analysis = true;
        }
      } else {
        // Fallback for legacy tests
        patch.js_source_code = (view.state.js_source_code || '') + input;
        patch.cursor_position = patch.js_source_code.length;
        patch.needs_analysis = true;
      }

      // Consume input
      patch.incoming_input = null;
    }

    // Typing never produces a Trace
    return { delta: { patch }, trace: null };
  }
};
