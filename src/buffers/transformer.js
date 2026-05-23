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

    // Restore state patching using dot-notation to avoid Root conflicts
    const patch = {
        'buffers.7.content': transformed
    };

    return { delta: { patch, signals }, trace: null };
  }
};
