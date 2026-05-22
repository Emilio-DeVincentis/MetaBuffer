// @ts-check

/**
 * @typedef {Object} HostEvent
 * @property {'UI_INPUT' | 'PROCESS_OUTPUT' | 'PROCESS_EXIT' | 'AGENT_RESULT'} kind
 * @property {unknown} payload
 */

/**
 * @typedef {Object} KernelCommand
 * @property {'SPAWN_PROCESS' | 'KILL_PROCESS' | 'INVOKE_AGENT'} kind
 * @property {unknown} payload
 */

export {};
