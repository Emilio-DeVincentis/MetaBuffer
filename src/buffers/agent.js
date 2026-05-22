// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */
/** @typedef {import('../types/index.js').Suggestion} Suggestion */
/** @typedef {import('../types/index.js').AgentStatus} AgentStatus */

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
    const patch = {};
    let trace = null;

    const command = view.state.agent_command;
    const result = view.state.pending_agent_result;

    // 1. Handle Activation Command
    if (command === 'ACTIVATE') {
      patch.agent_status = 'REQUESTED';
      patch.agent_command = null; // Consume command

      // Activation is a structural control change
      trace = { id: 0, metaBufferId: 4, parentTraceId: null, scope: [] };
    }

    // 2. Handle Consolidation of Asynchronous Result (injected by Device)
    if (result) {
      const currentSuggestions = view.state.suggestions ? { ...view.state.suggestions } : {};
      currentSuggestions['ai-agent'] = result;

      patch.suggestions = currentSuggestions;
      patch.agent_status = 'IDLE';
      patch.pending_agent_result = null; // Consume result

      // NO TRACE for consolidation as per specifications
    }

    return { delta: { patch }, trace };
  }
};
