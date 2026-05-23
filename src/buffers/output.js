// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/** @type {MetaBuffer} */
export const outputBuffer = {
  id: 8,
  parentId: 1,
  scope: ['buffers'],
  apply: (view) => {
    const signal = view.incomingSignals?.find(s => s.kind === 'TRANSFORM_RESULT');
    if (!signal) return { delta: { patch: {} }, trace: null };

    const result = String(signal.payload || '');

    const buffers = view.state.buffers ? { ...view.state.buffers } : {};
    if (buffers[8]) {
        buffers[8] = { ...buffers[8], content: result };
    }

    return { delta: { patch: { buffers } }, trace: null };
  }
};
