// @ts-check

/** @typedef {import('../types/index.js').Trace} Trace */

/**
 * Repository of pure functions for querying and navigating the Trace stack.
 * Adheres to the suckless, functional, and stateless philosophy.
 */

/**
 * Returns all root traces (traces with no parent).
 * @param {Trace[]} traceStack
 * @returns {Trace[]}
 */
export const getRootTraces = (traceStack) => {
    return traceStack.filter(t => t.parentTraceId === null);
};

/**
 * Returns the immediate children of a specific trace.
 * @param {Trace[]} traceStack
 * @param {number} parentId
 * @returns {Trace[]}
 */
export const getChildren = (traceStack, parentId) => {
    return traceStack.filter(t => t.parentTraceId === parentId);
};

/**
 * Returns the full ancestry (lineage) of a trace, from root to the trace itself.
 * @param {Trace[]} traceStack
 * @param {number} traceId
 * @returns {Trace[]}
 */
export const getAncestry = (traceStack, traceId) => {
    const ancestry = [];
    let currentId = traceId;

    while (currentId !== null) {
        const trace = traceStack.find(t => t.id === currentId);
        if (!trace) break;
        ancestry.unshift(trace);
        currentId = trace.parentTraceId;
    }

    return ancestry;
};

/**
 * Returns all descendants of a trace (full sub-tree).
 * @param {Trace[]} traceStack
 * @param {number} parentId
 * @returns {Trace[]}
 */
export const getDescendants = (traceStack, parentId) => {
    const descendants = [];
    const queue = [parentId];

    while (queue.length > 0) {
        const currentId = queue.shift();
        const children = getChildren(traceStack, currentId);
        descendants.push(...children);
        queue.push(...children.map(c => c.id));
    }

    return descendants;
};

/**
 * Finds a trace by its ID.
 * @param {Trace[]} traceStack
 * @param {number} traceId
 * @returns {Trace | undefined}
 */
export const findById = (traceStack, traceId) => {
    return traceStack.find(t => t.id === traceId);
};

/**
 * Groups traces by their parent ID.
 * @param {Trace[]} traceStack
 * @returns {Map<number|null, Trace[]>}
 */
export const groupByParent = (traceStack) => {
    const groups = new Map();
    for (const trace of traceStack) {
        const parentId = trace.parentTraceId;
        if (!groups.has(parentId)) {
            groups.set(parentId, []);
        }
        groups.get(parentId).push(trace);
    }
    return groups;
};
