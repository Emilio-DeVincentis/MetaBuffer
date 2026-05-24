// @ts-check

import { deepFreeze, success, failure } from './utils.js';

/** @typedef {import('../types/index.js').MetaBuffer} MetaBuffer */
/** @typedef {import('../types/index.js').Trace} Trace */
/** @typedef {import('../types/index.js').ContextView} ContextView */
/** @typedef {import('../types/index.js').ContextDelta} ContextDelta */
/** @typedef {import('../types/index.js').ExecutionResult} ExecutionResult */
/** @typedef {import('../types/index.js').KernelError} KernelError */

/**
 * @typedef {Object} KernelState
 * @property {Map<number, MetaBuffer>} buffers
 * @property {Record<string, unknown>} context
 * @property {Trace[]} traceStack
 * @property {Map<number, Record<string, unknown>>} snapshots
 * @property {number} snapshotInterval
 * @property {number} nextTraceId
 */

/**
 * Creates an initial kernel state.
 * @param {Object} [options]
 * @param {number} [options.snapshotInterval]
 * @param {Map<number, Record<string, unknown>>} [options.initialSnapshots]
 * @returns {KernelState}
 */
export const createInitialState = (options = {}) => ({
    buffers: new Map(),
    context: {},
    traceStack: [],
    snapshots: options.initialSnapshots || new Map(),
    snapshotInterval: options.snapshotInterval || 50,
    nextTraceId: 1
});

/**
 * Registers a MetaBuffer in the state.
 * @param {KernelState} state
 * @param {MetaBuffer} buffer
 * @returns {KernelState}
 */
export const registerBuffer = (state, buffer) => {
    const newBuffers = new Map(state.buffers);
    newBuffers.set(buffer.id, buffer);
    return { ...state, buffers: newBuffers };
};

/**
 * Sets initial context values.
 * @param {KernelState} state
 * @param {Record<string, unknown>} initialContext
 * @returns {KernelState}
 */
export const setContext = (state, initialContext) => ({
    ...state,
    context: { ...initialContext }
});

/**
 * Initializes the system and emits the mandatory BOOTSTRAP Trace.
 * @param {KernelState} state
 * @returns {ExecutionResult & { state?: KernelState }}
 */
export const initialize = (state) => {
    try {
        /** @type {Trace} */
        const bootstrapTrace = deepFreeze({
            id: state.nextTraceId,
            metaBufferId: 1, // Root MetaBuffer ID
            parentTraceId: null,
            scope: ['*'],
            delta: null
        });

        const newState = {
            ...state,
            traceStack: [bootstrapTrace],
            nextTraceId: state.nextTraceId + 1
        };

        return { ...success(true), state: newState };
    } catch (e) {
        return failure('BOOTSTRAP_FAILURE', e instanceof Error ? e.message : 'Unknown bootstrap error');
    }
};

/**
 * Dispatches a transition for a specific MetaBuffer, triggering reactions.
 * @param {KernelState} state
 * @param {number} triggerBufferId
 * @returns {ExecutionResult & { state?: KernelState }}
 */
export const dispatch = (state, triggerBufferId) => {
    const triggerBuffer = state.buffers.get(triggerBufferId);
    if (!triggerBuffer) {
        return failure('BUFFER_NOT_FOUND', `MetaBuffer with ID ${triggerBufferId} not found.`);
    }

    // Genealogy Validation
    if (triggerBuffer.parentId !== null && triggerBuffer.parentId !== undefined && !state.buffers.has(triggerBuffer.parentId)) {
        return failure('GENEALOGY_VIOLATION', `Parent buffer ${triggerBuffer.parentId} not found for buffer ${triggerBufferId}`, triggerBufferId);
    }

    try {
        // 1. Snapshot the initial state (frozen for safety)
        const snapshot = Object.freeze({ ...state.context });

        // 2. Initial Dispatch (Trigger)
        /** @type {ContextView} */
        const triggerView = {
            state: prepareViewState(triggerBuffer, snapshot),
            incomingSignals: [],
            // @ts-ignore
            isTrigger: true
        };
        const triggerResult = triggerBuffer.apply(triggerView);
        const triggerDelta = triggerResult.delta || { patch: {} };

        const triggerPatch = validatePatch(triggerBuffer, triggerDelta.patch);
        const aggregatedPatch = { ...triggerPatch };
        const emittedSignals = triggerDelta.signals ? [...triggerDelta.signals] : [];
        const primaryTrace = triggerResult.trace;

        // 3. Deterministic Reaction Pass
        const bufferIds = Array.from(state.buffers.keys()).sort((a, b) => a - b);
        for (const bufferId of bufferIds) {
            if (bufferId === triggerBufferId) continue;

            const buffer = state.buffers.get(bufferId);
            if (!buffer) continue;

            /** @type {ContextView} */
            const view = {
                state: prepareViewState(buffer, snapshot),
                incomingSignals: emittedSignals.filter(s => s.target === bufferId || s.target === null),
                // @ts-ignore
                isTrigger: false
            };

            const reactionResult = buffer.apply(view);
            const reactionDelta = reactionResult.delta;
            if (reactionDelta && reactionDelta.patch) {
                const reactionPatch = validatePatch(buffer, reactionDelta.patch);

                // Fail-fast conflict detection
                for (const key in reactionPatch) {
                    if (Object.prototype.hasOwnProperty.call(aggregatedPatch, key)) {
                        return failure('WRITE_CONFLICT', `Conflict on key '${key}' between buffer ${triggerBufferId} and ${bufferId}`, bufferId);
                    }
                    aggregatedPatch[key] = reactionPatch[key];
                }
            }

            if (reactionDelta && reactionDelta.signals) {
                emittedSignals.push(...reactionDelta.signals);
            }
        }

        // 4. Atomicity: Prepare Trace (One trace per dispatch)
        /** @type {Trace | null} */
        let finalTrace = null;
        let nextTraceId = state.nextTraceId;
        if (primaryTrace) {
            const parentTrace = state.traceStack[state.traceStack.length - 1] || null;
            finalTrace = deepFreeze({
                ...primaryTrace,
                id: nextTraceId++,
                metaBufferId: triggerBuffer.id,
                parentTraceId: parentTrace ? parentTrace.id : null,
                scope: [...triggerBuffer.scope],
                delta: { patch: aggregatedPatch }
            });
        }

        // 5. Atomic Commit
        let newContext = { ...state.context };
        for (const key in aggregatedPatch) {
            newContext = setContextValue(newContext, key, aggregatedPatch[key]);
        }

        const newTraceStack = finalTrace ? [...state.traceStack, finalTrace] : state.traceStack;
        const newSnapshots = new Map(state.snapshots);

        if (finalTrace) {
            const structuralTraceCount = newTraceStack.length;
            if (structuralTraceCount % state.snapshotInterval === 0) {
                newSnapshots.set(finalTrace.id, deepFreeze({ ...newContext }));
            }
        }

        const newState = {
            ...state,
            context: newContext,
            traceStack: newTraceStack,
            snapshots: newSnapshots,
            nextTraceId
        };

        return { ...success(true), state: newState };
    } catch (e) {
        return failure('DISPATCH_FAILURE', e instanceof Error ? e.message : 'Unknown dispatch error', triggerBufferId);
    }
};

/**
 * Helper to prepare isolated view state.
 * @param {MetaBuffer} buffer
 * @param {Record<string, unknown>} snapshot
 * @returns {Readonly<Record<string, unknown>>}
 */
const prepareViewState = (buffer, snapshot) => {
    /** @type {Record<string, unknown>} */
    const viewState = {};

    // Special case: Root Buffer (ID: 1) with wildcard can see everything
    if (buffer.id === 1 && buffer.scope.includes('*')) {
        return Object.freeze({ ...snapshot });
    }

    for (const key of buffer.scope) {
        if (Object.prototype.hasOwnProperty.call(snapshot, key)) {
            viewState[key] = snapshot[key];
        }
    }
    return Object.freeze(viewState);
};

/**
 * Helper to validate patch against scope.
 * @param {MetaBuffer} buffer
 * @param {Record<string, unknown>} patch
 * @returns {Record<string, unknown>}
 */
const validatePatch = (buffer, patch) => {
    /** @type {Record<string, unknown>} */
    const validPatch = {};
    if (patch) {
        // Strict isolation: '*' wildcard is only allowed for the Root MetaBuffer (ID: 1)
        const hasWildcard = buffer.scope.includes('*');
        const isRoot = buffer.id === 1;

        for (const key in patch) {
            const baseKey = key.split('.')[0];
            const isAllowed = (isRoot && hasWildcard) || buffer.scope.includes(baseKey);

            if (isAllowed) {
                validPatch[key] = patch[key];
            } else {
                console.warn(`MetaBuffer ${buffer.id} (parentId: ${buffer.parentId}) attempted to write out-of-scope key: ${key}`);
            }
        }
    }
    return validPatch;
};

/**
 * Internal helper to set context value, supporting dot-notation.
 * Returns a new context object.
 * @param {Record<string, unknown>} context
 * @param {string} key
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
const setContextValue = (context, key, value) => {
    if (!key.includes('.')) {
        return { ...context, [key]: value };
    }

    const parts = key.split('.');
    const newContext = { ...context };
    let curr = newContext;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        curr[part] = { ...curr[part] };
        curr = curr[part];
    }
    curr[parts[parts.length - 1]] = value;
    return newContext;
};

/**
 * Reconstructs the state from Traces, starting from the nearest snapshot.
 * @param {KernelState} state
 * @param {number} targetTraceId
 * @returns {ExecutionResult}
 */
export const reconstructState = (state, targetTraceId) => {
    try {
        let currentState = {};
        let startTraceIndex = 0;

        const snapshotTraceIds = Array.from(state.snapshots.keys())
            .filter((id) => id <= targetTraceId)
            .sort((a, b) => b - a);

        if (snapshotTraceIds.length > 0) {
            const nearestSnapshotId = snapshotTraceIds[0];
            currentState = { ...state.snapshots.get(nearestSnapshotId) };
            startTraceIndex = state.traceStack.findIndex((t) => t.id === nearestSnapshotId) + 1;
        }

        for (let i = startTraceIndex; i < state.traceStack.length; i++) {
            const trace = state.traceStack[i];
            if (trace.id > targetTraceId) break;

            if (trace.delta && trace.delta.patch) {
                // Apply patch manually supporting dot notation if needed
                for (const key in trace.delta.patch) {
                    currentState = setContextValue(currentState, key, trace.delta.patch[key]);
                }
            }
        }

        return success(currentState);
    } catch (e) {
        return failure('RECONSTRUCTION_FAILURE', e instanceof Error ? e.message : 'Unknown reconstruction error');
    }
};

/**
 * Performs a rollback to a target Trace ID.
 * @param {KernelState} state
 * @param {number} targetTraceId
 * @returns {ExecutionResult & { state?: KernelState }}
 */
export const rollback = (state, targetTraceId) => {
    const result = reconstructState(state, targetTraceId);
    if (!result.ok) return result;

    const targetIndex = state.traceStack.findIndex((t) => t.id === targetTraceId);
    if (targetIndex === -1) {
        return failure('TRACE_NOT_FOUND', `Trace with ID ${targetTraceId} not found in stack.`);
    }

    const newState = {
        ...state,
        context: { .../** @type {Record<string, unknown>} */ (result.value) },
        traceStack: state.traceStack.slice(0, targetIndex + 1)
    };

    return { ...success(true), state: newState };
};
