// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/** @type {MetaBuffer} */
export const outputBuffer = {
  id: 8,
  parentId: 1,
  scope: ['buffers', 'runtime_output', 'incoming_output_chunk', 'run_status'],
  apply: (view) => {
    const patch = {};

    // 1. Handle External Process Output (Shell -> Kernel)
    // The Shell dispatches with 'incoming_output_chunk' in context.
    const chunk = /** @type {import('../types/index.js').OutputChunk|null} */ (view.state.incoming_output_chunk);
    if (chunk) {
        const output = Array.isArray(view.state.runtime_output) ? [...view.state.runtime_output] : [];
        output.push(chunk);
        patch.runtime_output = output;
        patch.incoming_output_chunk = null; // Consume

        if (chunk.type === 'exit') {
            patch.run_status = 'IDLE';
        }
    }

    // 2. Handle Transformer Result
    const transformSignal = view.incomingSignals?.find(s => s.kind === 'TRANSFORM_RESULT');
    if (transformSignal) {
        const result = String(transformSignal.payload || '');
        patch['buffers.8.content'] = result;
    }

    return { delta: { patch }, trace: null };
  }
};
