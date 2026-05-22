// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/** @type {MetaBuffer} */
export const rootBuffer = {
  id: 1,
  parentId: null,
  scope: [
    'active_buffers',
    'focus_stack',
    'pending_command',
    'needs_analysis',
    'agent_status',
    'agent_command'
  ],
  apply: (view) => {
    const patch = {};
    let trace = null;

    // Coordination: Root observes needs_analysis signal
    if (view.state.needs_analysis) {
      // In a real system, this might trigger a structural change or
      // prepare the focus stack for the analyzer.
      // For now, we clear the signal. The external Host/Device will
      // see this change and decide when to dispatch the Analyzer (ID 3).
      patch.needs_analysis = false;
    }

    const command = view.state.pending_command;

    if (command) {
      if (command.type === 'ACTIVATE_BUFFER') {
        const activeBuffers = Array.isArray(view.state.active_buffers)
          ? [...view.state.active_buffers]
          : [];

        if (!activeBuffers.includes(command.bufferId)) {
          activeBuffers.push(command.bufferId);
          patch.active_buffers = activeBuffers;
        }

        const focusStack = Array.isArray(view.state.focus_stack)
          ? [...view.state.focus_stack]
          : [];

        focusStack.push(command.bufferId);
        patch.focus_stack = focusStack;

        // Structural change produces a Trace
        trace = { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] };
      } else if (command.type === 'ACTIVATE_AGENT') {
        patch.agent_command = 'ACTIVATE';
      } else if (command.type === 'CANCEL_AGENT') {
        patch.agent_status = 'IDLE';
        patch.agent_command = null;
        // Cancellation is an act of control -> Trace
        trace = { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] };
      }

      // Always consume the command
      patch.pending_command = null;
    }

    return { delta: { patch }, trace };
  }
};
