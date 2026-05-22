// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/** @type {MetaBuffer} */
export const editorBuffer = {
  id: 2,
  parentId: 1, // Root is the parent
  scope: ['js_source_code', 'cursor_position', 'incoming_input', 'needs_analysis'],
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

      // Signal that analysis is needed after a mutation
      patch.needs_analysis = true;
    }

    // Typing never produces a Trace
    return { delta: { patch }, trace: null };
  }
};
