// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */
/** @typedef {import('../types/index.js').Suggestion} Suggestion */
/** @typedef {import('../types/index.js').AgentStatus} AgentStatus */

const handlers = {
    ACTIVATE: () => ({
        patch: { agent_status: 'REQUESTED', agent_command: null },
        signals: [{ kind: 'AGENT_REQUESTED' }],
        trace: { id: 0, metaBufferId: 4, parentTraceId: null, scope: [] }
    })
};

/** @type {MetaBuffer} */
export const agentBuffer = {
  id: 4,
  parentId: 1, // Child of Root
  scope: [
    'agent_status',
    'agent_command',
    'pending_agent_result',
    'suggestions',
    'js_source_code',
    'diagnostics'
  ],
  apply: (view) => {
    let patch = {};
    let signals = [];
    let trace = null;

    const command = view.state.agent_command;
    const result = view.state.pending_agent_result;

    // 1. Handle Commands via ADT
    if (command && handlers[command]) {
        const res = handlers[command]();
        patch = { ...patch, ...res.patch };
        signals = [...signals, ...(res.signals || [])];
        trace = res.trace;
    }

    // 2. Handle Consolidation
    if (result) {
      const currentSuggestions = view.state.suggestions ? { ...view.state.suggestions } : {};
      currentSuggestions['ai-agent'] = result;

      patch.suggestions = currentSuggestions;
      patch.agent_status = 'IDLE';
      patch.pending_agent_result = null;
    }

    return { delta: { patch, signals }, trace };
  }
};
