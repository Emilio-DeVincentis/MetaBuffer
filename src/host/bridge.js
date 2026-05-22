// @ts-check

/** @typedef {import('../core/MetaBufferRuntime.js').MetaBufferRuntime} MetaBufferRuntime */
/** @typedef {import('./types.js').HostEvent} HostEvent */
/** @typedef {import('./types.js').KernelCommand} KernelCommand */

/**
 * Command Bridge - Host Isolation Layer for NeutralinoJS.
 * This module is impure and host-specific.
 */
export class CommandBridge {
  /**
   * @param {MetaBufferRuntime} runtime
   */
  constructor(runtime) {
    this.runtime = runtime;
    /** @private */
    this.isObserving = false;
  }

  /**
   * Initializes the bridge and the underlying runtime.
   */
  init() {
    // 1. Initialize the Core Runtime
    this.runtime.initialize();

    // 2. Start observing context for Kernel -> Host commands
    this.startObservation();
  }

  /**
   * Translates Host events into Runtime dispatches.
   * @param {HostEvent} event
   */
  handleHostEvent(event) {
    const patch = {};
    let targetBufferId = null;

    switch (event.kind) {
      case 'UI_INPUT':
        patch.incoming_input = event.payload;
        targetBufferId = 2; // Editor
        break;
      case 'PROCESS_OUTPUT':
        patch.incoming_output_chunk = event.payload;
        targetBufferId = 5; // Executor
        break;
      case 'AGENT_RESULT':
        patch.pending_agent_result = event.payload;
        targetBufferId = 4; // Agent
        break;
      case 'PROCESS_EXIT':
        patch.incoming_output_chunk = { type: 'exit', code: event.payload };
        targetBufferId = 5; // Executor
        break;
    }

    if (targetBufferId !== null) {
      // 1. Inject data into context
      this.runtime.setContext({
        ...this.runtime.getContext(),
        ...patch
      });

      // 2. Dispatch the target MetaBuffer
      this.runtime.dispatch(targetBufferId);

      // 3. React to any new state changes (Loop closure)
      this.checkKernelRequests();
    }
  }

  /**
   * Observes the context to detect and execute Kernel commands.
   * @private
   */
  startObservation() {
    if (this.isObserving) return;
    this.isObserving = true;

    // The bridge is the host-side controller. It initiates the first check
    // after bootstrap and continues observation after every dispatch.
    this.checkKernelRequests();
  }

  /**
   * Checks for REQUESTED states in the context and invokes Host APIs.
   */
  checkKernelRequests() {
    const context = this.runtime.getContext();

    // 1. Check for Run Request
    if (context.run_status === 'REQUESTED') {
      this.executeHostCommand({
        kind: 'SPAWN_PROCESS',
        payload: { code: context.js_source_code }
      });
    }

    // 2. Check for Agent Request
    if (context.agent_status === 'REQUESTED') {
      this.executeHostCommand({
        kind: 'INVOKE_AGENT',
        payload: { code: context.js_source_code }
      });
    }

    // 3. Check for Kill Signal
    if (context.run_command === 'KILL') {
        this.executeHostCommand({
            kind: 'KILL_PROCESS',
            payload: null
        });
    }
  }

  /**
   * Executes an impure host command (NeutralinoJS calls).
   * @param {KernelCommand} command
   * @private
   */
  executeHostCommand(command) {
    // Only access window.NL_* within this specific, isolated method.
    const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).NL_ : null;

    if (!NL) {
      // console.warn('Neutralino API not found. Simulation mode.');
      return;
    }

    switch (command.kind) {
      case 'SPAWN_PROCESS':
        // Example: NL.os.spawnProcess(...)
        break;
      case 'KILL_PROCESS':
        // Example: NL.os.killProcess(...)
        break;
      case 'INVOKE_AGENT':
        // Example: Host-side LLM call
        break;
    }
  }
}
