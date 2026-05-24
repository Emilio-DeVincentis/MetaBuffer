// @ts-check

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */
/** @typedef {import('../types/index.js').ContextView} ContextView */
/** @typedef {import('../types/index.js').ContextDelta} ContextDelta */
/** @typedef {import('../types/index.js').Trace} Trace */

/**
 * @typedef {Object} CommandPayload
 * @property {string} [type]
 * @property {number} [bufferId]
 * @property {string} [kind]
 * @property {string} [initialContent]
 * @property {string} [content]
 * @property {Record<string, unknown>} [metadata]
 */

const createFocusPatch = (state, targetId) => {
    if (targetId === state.focused_buffer_id) return {};
    const focusStack = Array.isArray(state.focus_stack) ? [...state.focus_stack] : [];
    focusStack.push(targetId);
    return { focused_buffer_id: targetId, focus_stack: focusStack };
};

const handlers = {
    FOCUS_BUFFER: (state, payload) => ({
        patch: createFocusPatch(state, payload.bufferId),
        trace: {}
    }),
    FOCUS_NEXT: (state) => {
        const activeBuffers = state.active_buffers || [];
        const currentIndex = activeBuffers.indexOf(state.focused_buffer_id);
        const nextIndex = (currentIndex + 1) % activeBuffers.length;
        const targetId = activeBuffers[nextIndex];
        return {
            patch: createFocusPatch(state, targetId),
            trace: {}
        };
    },
    FOCUS_PREV: (state) => {
        const activeBuffers = state.active_buffers || [];
        const currentIndex = activeBuffers.indexOf(state.focused_buffer_id);
        const nextIndex = (currentIndex - 1 + activeBuffers.length) % activeBuffers.length;
        const targetId = activeBuffers[nextIndex];
        return {
            patch: createFocusPatch(state, targetId),
            trace: {}
        };
    },
    CREATE_BUFFER: (state, payload) => {
        const nextId = state.next_buffer_id || 100;
        const newBuffer = {
            id: nextId,
            kind: payload.kind || 'editor',
            content: payload.initialContent || '',
            metadata: {}
        };
        const buffers = state.buffers ? { ...state.buffers } : {};
        buffers[nextId] = newBuffer;

        const activeBuffers = Array.isArray(state.active_buffers) ? [...state.active_buffers] : [];
        activeBuffers.push(nextId);

        const focusStack = Array.isArray(state.focus_stack) ? [...state.focus_stack] : [];
        focusStack.push(nextId);

        return {
            patch: {
                buffers,
                next_buffer_id: nextId + 1,
                focused_buffer_id: nextId,
                focus_stack: focusStack,
                active_buffers: activeBuffers
            },
            trace: {}
        };
    },
    ACTIVATE_BUFFER: (state, payload) => {
        const activeBuffers = Array.isArray(state.active_buffers) ? [...state.active_buffers] : [];
        const patch = {};
        if (!activeBuffers.includes(payload.bufferId)) {
            activeBuffers.push(payload.bufferId);
            patch.active_buffers = activeBuffers;
        }
        const focusStack = Array.isArray(state.focus_stack) ? [...state.focus_stack] : [];
        focusStack.push(payload.bufferId);
        patch.focus_stack = focusStack;
        patch.focused_buffer_id = payload.bufferId;

        return {
            patch,
            trace: {}
        };
    },
    ACTIVATE_AGENT: () => ({
        patch: { agent_command: 'ACTIVATE' },
        trace: {} // ACTIVATE_AGENT is structural (taking control)
    }),
    CANCEL_AGENT: () => ({
        patch: { agent_status: 'IDLE', agent_command: null },
        trace: {}
    }),
    ACTIVATE_RUN: () => ({
        patch: { run_command: 'ACTIVATE' },
        trace: {} // ACTIVATE_RUN is structural
    }),
    KILL_RUN: () => ({
        patch: { run_status: 'IDLE', run_command: 'KILL' },
        trace: {}
    }),
    BREAK_ILLUSION: () => ({
        patch: { system_mode: 'REFLEXIVE' },
        trace: { metadata: { type: 'BREAK_ILLUSION' } }
    }),
    RESTORE_ILLUSION: () => ({
        patch: { system_mode: 'DEFAULT' },
        trace: { metadata: { type: 'RESTORE_ILLUSION' } }
    }),
    COMMIT_SUGGESTION: (state, payload) => {
        const targetId = payload.bufferId;
        const buffers = state.buffers ? { ...state.buffers } : {};
        if (buffers[targetId]) {
            buffers[targetId] = {
                ...buffers[targetId],
                content: (buffers[targetId].content || '') + payload.content
            };
            return {
                patch: { buffers },
                trace: {
                    metadata: payload.metadata
                }
            };
        }
        return { patch: {}, trace: null };
    }
};

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
        'next_buffer_id',
        'system_mode'
    ],
    apply: (view) => {
        let patch = {};
        const signals = [];
        let trace = null;

        // 1. Coordination Signals
        if (view.state.needs_analysis) {
            patch.needs_analysis = false;
            signals.push({ kind: 'REQUEST_ANALYSIS', target: 3 });
        }

        // 2. ADT Pattern Matching for Commands
        const command = view.state.pending_command;
        if (command && command.type) {
            const handler = handlers[command.type];
            if (handler) {
                const result = handler(view.state, command);
                patch = { ...patch, ...result.patch, pending_command: null };
                trace = result.trace;
            } else {
                patch.pending_command = null;
            }
        }

        return { delta: { patch, signals }, trace };
    }
};
