// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/** @type {MetaBuffer} */
export const transformerBuffer = {
  id: 7,
  parentId: 1,
  scope: ['buffers'],
  apply: (view) => {
    const signal = view.incomingSignals?.find(s => s.kind === 'EXECUTION_STARTED');
    if (!signal) return { delta: { patch: {} }, trace: null };

    const sourceCode = String(signal.payload || '');
    const transformed = sourceCode.toUpperCase();

    const signals = [
      { kind: 'TRANSFORM_RESULT', target: 8, payload: transformed }
    ];

    // Note: We don't write to buffers here to respect the "one pass" rule
    // if Output buffer is also going to write to its own space.
    // Actually, Transform can write to ITS OWN buffer space.
    const buffers = view.state.buffers ? { ...view.state.buffers } : {};
    if (buffers[7]) {
        buffers[7] = { ...buffers[7], content: transformed };
    }

    return { delta: { patch: { buffers }, signals }, trace: null };
  }
};
