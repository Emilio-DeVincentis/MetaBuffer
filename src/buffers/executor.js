// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */
/** @typedef {import('../types/index.js').OutputChunk} OutputChunk */
/** @typedef {import('../types/index.js').RunStatus} RunStatus */

/** @type {MetaBuffer} */
export const executorBuffer = {
  id: 5,
  parentId: 1, // Child of Root
  scope: [
    'js_source_code',
    'runtime_output',
    'run_status',
    'run_command',
    'incoming_output_chunk'
  ],
  apply: (view) => {
    const patch = {};
    let trace = null;

    const command = view.state.run_command;
    const chunk = view.state.incoming_output_chunk;

    // 1. Handle Execution Request
    if (command === 'ACTIVATE') {
      patch.run_status = 'REQUESTED';
      patch.run_command = null; // Consume command
      patch.runtime_output = []; // Reset output for new run

      // Activation is a structural control change
      trace = { id: 0, metaBufferId: 5, parentTraceId: null, scope: [] };
    }

    // 2. Handle Incoming Output (Streaming)
    if (chunk) {
      const output = Array.isArray(view.state.runtime_output)
        ? [...view.state.runtime_output]
        : [];

      output.push(chunk);
      patch.runtime_output = output;
      patch.incoming_output_chunk = null; // Consume chunk

      // If it's an exit chunk, transition status to IDLE
      if (chunk.type === 'exit') {
        patch.run_status = 'IDLE';
      }

      // NO TRACE for content mutation (streaming)
    }

    return { delta: { patch }, trace };
  }
};
