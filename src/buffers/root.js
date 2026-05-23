// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/** @type {MetaBuffer} */
export const rootBuffer = {
  id: 1,
  parentId: null,
  scope: [
    'active_buffers',
    'focus_stack',
    'focused_buffer_id',
    'buffers',
    'pending_command',
    'needs_analysis',
    'agent_status',
    'agent_command',
    'run_status',
    'run_command',
    'next_buffer_id'
  ],
  apply: (view) => {
    const patch = {};
    const signals = [];
    let trace = null;

    // Coordination: Root observes needs_analysis signal
    if (view.state.needs_analysis) {
      patch.needs_analysis = false;
      signals.push({ kind: 'REQUEST_ANALYSIS', target: 3 });
    }

    const command = view.state.pending_command;

    if (command) {
      if (command.type === 'FOCUS_BUFFER') {
        const targetId = command.bufferId;
        if (targetId !== view.state.focused_buffer_id) {
          patch.focused_buffer_id = targetId;
          const focusStack = Array.isArray(view.state.focus_stack)
            ? [...view.state.focus_stack]
            : [];
          focusStack.push(targetId);
          patch.focus_stack = focusStack;
          trace = { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] };
        }
      } else if (command.type === 'FOCUS_NEXT' || command.type === 'FOCUS_PREV') {
          const activeBuffers = view.state.active_buffers || [];
          const currentIndex = activeBuffers.indexOf(view.state.focused_buffer_id);
          let nextIndex = currentIndex;
          if (command.type === 'FOCUS_NEXT') nextIndex = (currentIndex + 1) % activeBuffers.length;
          else nextIndex = (currentIndex - 1 + activeBuffers.length) % activeBuffers.length;

          const targetId = activeBuffers[nextIndex];
          if (targetId !== view.state.focused_buffer_id) {
              patch.focused_buffer_id = targetId;
              const focusStack = Array.isArray(view.state.focus_stack) ? [...view.state.focus_stack] : [];
              focusStack.push(targetId);
              patch.focus_stack = focusStack;
              trace = { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] };
          }
      } else if (command.type === 'CREATE_BUFFER') {
        const nextId = view.state.next_buffer_id || 100;
        const newBuffer = {
          id: nextId,
          kind: command.kind || 'editor',
          content: command.initialContent || '',
          metadata: {}
        };
        const buffers = view.state.buffers ? { ...view.state.buffers } : {};
        buffers[nextId] = newBuffer;
        patch.buffers = buffers;
        patch.next_buffer_id = nextId + 1;

        patch.focused_buffer_id = nextId;
        const focusStack = Array.isArray(view.state.focus_stack)
            ? [...view.state.focus_stack]
            : [];
        focusStack.push(nextId);
        patch.focus_stack = focusStack;

        const activeBuffers = Array.isArray(view.state.active_buffers)
          ? [...view.state.active_buffers]
          : [];
        activeBuffers.push(nextId);
        patch.active_buffers = activeBuffers;

        trace = { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] };
      } else if (command.type === 'ACTIVATE_BUFFER') {
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
        patch.focused_buffer_id = command.bufferId;

        // Structural change produces a Trace
        trace = { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] };
      } else if (command.type === 'ACTIVATE_AGENT') {
        patch.agent_command = 'ACTIVATE';
      } else if (command.type === 'CANCEL_AGENT') {
        patch.agent_status = 'IDLE';
        patch.agent_command = null;
        // Cancellation is an act of control -> Trace
        trace = { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] };
      } else if (command.type === 'ACTIVATE_RUN') {
        patch.run_command = 'ACTIVATE';
      } else if (command.type === 'KILL_RUN') {
        patch.run_status = 'IDLE';
        patch.run_command = 'KILL';
        // Kill is an act of control -> Trace
        trace = { id: 0, metaBufferId: 1, parentTraceId: null, scope: [] };
      }

      // Always consume the command
      patch.pending_command = null;
    }

    return { delta: { patch, signals }, trace };
  }
};
