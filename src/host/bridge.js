// @ts-check

import { exportState } from '../core/serialization.js';

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
    /** @private */
    this.saveFilePath = './metabuffer_state.json';
    /** @private */
    this.activeProcessId = null;
  }

  /**
   * Initializes the bridge and the underlying runtime.
   */
  init() {
    // 1. Start observing context for Kernel -> Host commands
    this.startObservation();

    // 2. Setup lifecycle listeners (NeutralinoJS)
    const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).NL_ : null;
    if (NL) {
      NL.events.on('appClose', async () => {
        await this.saveState();
        NL.app.exit();
      });
    }
  }

  /**
   * Translates Host events into Runtime dispatches.
   * @param {HostEvent} event
   */
  handleHostEvent(event) {
    const patch = {};
    let targetBufferId = null;

    const context = this.runtime.getContext();

    switch (event.kind) {
      case 'UI_INPUT':
        patch.incoming_input = event.payload;
        // Find which buffer should receive input
        targetBufferId = 2; // Default to legacy editor for safety,
                            // but the new editorBuffer will use focused_buffer_id
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
        this.activeProcessId = null;
        break;
      case 'COMMAND':
        patch.pending_command = event.payload;
        targetBufferId = 1; // Root
        break;
    }

    if (targetBufferId !== null) {
      // 1. Inject data into context
      this.runtime.setContext({
        ...this.runtime.getContext(),
        ...patch
      });

      // 2. Dispatch the target MetaBuffer
      const result = this.runtime.dispatch(targetBufferId);

      if (!result.ok && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('kernel-error', { detail: result.error }));
      }

      // 3. React to any new state changes (Loop closure)
      this.checkKernelRequests();

      return result;
    }
  }

  /**
   * Observes the context to detect and execute Kernel commands.
   * @private
   */
  startObservation() {
    if (this.isObserving) return;
    this.isObserving = true;

    // The bridge is the host-side controller.
    this.checkKernelRequests();
  }

  /**
   * Checks for REQUESTED states in the context and invokes Host APIs.
   */
  checkKernelRequests() {
    const context = this.runtime.getContext();

    // 1. Check for Run Request
    if (context.run_status === 'REQUESTED' && !this.activeProcessId) {
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

    // 4. Check for Analysis Signal
    if (context.needs_analysis) {
        // In Phase 4, analysis is a reactive side-effect of Root or Editor.
        // We dispatch Root to trigger the signal-based reaction chain.
        this.runtime.dispatch(1); // Root
    }
  }

  /**
   * Executes an impure host command (NeutralinoJS calls).
   * @param {KernelCommand} command
   * @private
   */
  async executeHostCommand(command) {
    const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).NL_ : null;

    if (!NL) {
      // Simulation mode
      if (command.kind === 'SPAWN_PROCESS') {
          console.log('SIM: Spawning process for code', command.payload.code);
          // Fake output
          setTimeout(() => {
              this.handleHostEvent({ kind: 'PROCESS_OUTPUT', payload: { type: 'stdout', text: 'Running...\n' } });
              setTimeout(() => {
                  this.handleHostEvent({ kind: 'PROCESS_EXIT', payload: 0 });
              }, 500);
          }, 100);
          this.activeProcessId = 'sim-pid';
      }
      return;
    }

    switch (command.kind) {
      case 'SPAWN_PROCESS':
        try {
          // In a real MVP, we might write the code to a temp file and run it with node
          // or use a specific host-side runner.
          const tempFile = './temp_run.js';
          await NL.filesystem.writeFile(tempFile, command.payload.code);
          const processInfo = await NL.os.spawnProcess(`node ${tempFile}`);
          this.activeProcessId = processInfo.id;

          const processListener = (evt) => {
              if (evt.id === this.activeProcessId) {
                  if (evt.action === 'stdOut') {
                      this.handleHostEvent({ kind: 'PROCESS_OUTPUT', payload: { type: 'stdout', text: evt.data } });
                  } else if (evt.action === 'stdErr') {
                      this.handleHostEvent({ kind: 'PROCESS_OUTPUT', payload: { type: 'stderr', text: evt.data } });
                  } else if (evt.action === 'exit') {
                      this.handleHostEvent({ kind: 'PROCESS_EXIT', payload: evt.data });
                      NL.events.off('spawnedProcess', processListener);
                  }
              }
          };
          NL.events.on('spawnedProcess', processListener);
        } catch (e) {
          console.error('Failed to spawn process', e);
        }
        break;

      case 'KILL_PROCESS':
        if (this.activeProcessId) {
            try {
                await NL.os.execCommand(`kill ${this.activeProcessId}`);
                this.activeProcessId = null;
            } catch (e) {
                console.error('Failed to kill process', e);
            }
        }
        break;

      case 'INVOKE_AGENT':
        // Fake Agent for MVP
        setTimeout(() => {
            this.handleHostEvent({
                kind: 'AGENT_RESULT',
                payload: [
                    { id: '1', kind: 'info', explanation: 'Found potential optimization in the loops.' }
                ]
            });
        }, 1000);
        break;
    }
  }

  /**
   * Saves the current runtime state to the file system.
   */
  async saveState() {
    const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).NL_ : null;
    const stateBlob = exportState(this.runtime);

    if (NL) {
      try {
        await NL.filesystem.writeFile(this.saveFilePath, stateBlob);
      } catch (e) {
        console.error('Failed to save state', e);
      }
    } else {
      localStorage.setItem('metabuffer_state', stateBlob);
    }
  }
}
