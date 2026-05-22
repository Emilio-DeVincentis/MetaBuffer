// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */

/** @type {MetaBuffer} */
export const rootBuffer = {
  id: 1,
  parentId: null,
  scope: ['active_buffers', 'focus_stack', 'pending_command'],
  apply: (view) => {
    const patch = {};
    let trace = null;

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
      }

      // Always consume the command
      patch.pending_command = null;
    }

    return { delta: { patch }, trace };
  }
};
