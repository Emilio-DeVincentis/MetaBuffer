// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/** @type {MetaBuffer} */
export const editorBuffer = {
  id: 2,
  parentId: 1, // Root is the parent
  scope: ['js_source_code', 'cursor_position', 'incoming_input'],
  apply: (view) => {
    const patch = {};
    const input = view.state.incoming_input;

    if (input) {
      // Content mutation: append input to source code
      const currentCode = view.state.js_source_code || '';
      patch.js_source_code = currentCode + input;

      // Update cursor (minimalistic approach: length of string)
      patch.cursor_position = patch.js_source_code.length;

      // Consume input
      patch.incoming_input = null;
    }

    // Typing never produces a Trace
    return { delta: { patch }, trace: null };
  }
};
