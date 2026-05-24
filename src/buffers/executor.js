// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

const handlers = {
    ACTIVATE: (state) => ({
        patch: {
            run_status: 'REQUESTED',
            run_command: null,
            runtime_output: []
        },
        signals: [{ kind: 'EXECUTION_STARTED', target: null, payload: state.js_source_code }],
        trace: {}
    })
};

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
    let patch = {};
    let signals = [];
    let trace = null;

    const command = view.state.run_command;
    const chunk = view.state.incoming_output_chunk;

    // 1. Handle Commands via ADT
    if (command && handlers[command]) {
        const result = handlers[command](view.state);
        patch = { ...patch, ...result.patch };
        signals = [...signals, ...(result.signals || [])];
        trace = result.trace;
    }

    // 2. Handle Incoming Output (Streaming) - Discrete content mutation
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
    }

    return { delta: { patch, signals }, trace };
  }
};
