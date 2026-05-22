// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/**
 * Minimalist suckless JS analysis routine.
 * @param {string} code
 * @returns {string[]} List of diagnostic messages.
 */
function analyzeJS(code) {
  const diagnostics = [];
  const braceStack = [];
  const lines = code.split('\n');

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    if (char === '{') {
      braceStack.push({ pos: i });
    } else if (char === '}') {
      if (braceStack.length === 0) {
        diagnostics.push(`Unbalanced closing brace at position ${i}`);
      } else {
        braceStack.pop();
      }
    }
  }

  while (braceStack.length > 0) {
    const { pos } = braceStack.pop();
    diagnostics.push(`Unbalanced opening brace at position ${pos}`);
  }

  // Very simple semicolon check: lines that are not empty,
  // don't end in { or } or ; or , and don't look like comments.
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.length > 0 &&
        !trimmed.endsWith('{') &&
        !trimmed.endsWith('}') &&
        !trimmed.endsWith(';') &&
        !trimmed.endsWith(',') &&
        !trimmed.startsWith('//') &&
        !trimmed.startsWith('/*')) {
      // Note: this is a naive check, but fits 'suckless minimal'
      // diagnostics.push(`Potential missing semicolon at line ${index + 1}`);
    }
  });

  return diagnostics;
}

/** @type {MetaBuffer} */
export const jsAnalyzerBuffer = {
  id: 3,
  parentId: 2, // Child of Editor
  scope: ['js_source_code', 'diagnostics'],
  apply: (view) => {
    const code = view.state.js_source_code || '';
    const results = analyzeJS(code);

    const diagnostics = view.state.diagnostics ? { ...view.state.diagnostics } : {};
    diagnostics['js-analyzer'] = results;

    return {
      delta: { patch: { diagnostics } },
      // Automatic analysis triggered by content mutation MUST NOT generate Trace.
      // Trace is reserved for explicit, user-initiated control shifts.
      trace: null
    };
  }
};
