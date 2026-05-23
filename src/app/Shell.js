// @ts-check

import { exportState, hydrateState } from '../core/serialization.js';
import { projectCode, projectWorkspace, projectDiagnostics, projectTerminal } from '../core/projections.js';
import { pythonAnalyzer } from './presets/python.js';
import { javaAnalyzer } from './presets/java.js';
import { mockAIAgent } from './presets/ai.js';

/** @typedef {import('../core/MetaBufferRuntime.js').MetaBufferRuntime} MetaBufferRuntime */
/** @typedef {import('../types/index.js').ExecutionResult} ExecutionResult */

/**
 * Shell handles the bridge between the Kernel and the Host (NeutralinoJS).
 * Responsibilities:
 * - Persistence (Atomic FS operations)
 * - Process spawning and isolation
 * - Ephemeral view state (typing)
 * - Projection-to-UI distribution
 */
export class Shell {
    /**
     * @param {MetaBufferRuntime} runtime
     * @param {Object} [options]
     * @param {'fs' | 'idb'} [options.storageMode]
     */
    constructor(runtime, options = {}) {
        this.runtime = runtime;
        this.sessionFile = './session.json';
        this.tempFile = './session.tmp';
        this.version = '1.0.0';
        this.storageMode = options.storageMode || 'fs';

        /** @private */
        this.lastSerializedState = null;
        /** @private */
        this.isPreviewing = false;
        /** @private */
        this.ephemeralTextBuffers = new Map(); // bufferId -> string
        /** @private */
        this.currentProcess = null;
        /** @private */
        this.db = null;

        // Phase 8: Volatile Boundary Layer State
        /** @private */
        this.activeAISuggestion = null; // { text, bufferId, metadata }
        /** @private */
        this.isAiGenerating = false;
    }

    /**
     * Boot the shell: validate integrity and hydrate.
     */
    async boot() {
        const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).Neutralino : null;

        // Storage configuration (Phase 7: IndexedDB vs FS)
        if (!NL && typeof indexedDB !== 'undefined') {
            this.storageMode = 'idb';
        }

        if (this.storageMode === 'idb') {
            await this._initIndexedDB();
        }

        // 1. Integrity check and Hydration
        try {
            let blob = null;
            if (this.storageMode === 'fs' && NL) {
                const tmpExists = await this._fileExists(this.tempFile);
                if (tmpExists) throw new Error('CRITICAL_INTEGRITY_FAILURE: session.tmp detected.');

                const sessionExists = await this._fileExists(this.sessionFile);
                if (sessionExists) {
                    blob = await NL.filesystem.readFile(this.sessionFile);
                }
            } else if (this.storageMode === 'idb') {
                blob = await this._readFromIndexedDB();
            }

            if (blob) {
                const res = await this._hydrateWithRecovery(blob);
                if (!res.ok) throw new Error(res.error.message);
            } else {
                this.runtime.initialize();
                this._setInitialContext();
            }
        } catch (e) {
            this._renderFatalError(`Boot Failure: ${e.message}`);
            return { success: false, error: e };
        }

        if (NL) this._setupNativeEventListeners(NL);

        this._sync();
        return { success: true };
    }

    /**
     * Hydrate with Disaster Recovery Policy (Phase 7)
     * @private
     */
    async _hydrateWithRecovery(blob) {
        try {
            const wrapper = JSON.parse(blob);
            const expectedChecksum = this._calculateChecksum(wrapper.data);

            if (wrapper.checksum !== expectedChecksum) {
                this._renderNotification('WARNING: Corrupted session detected. Attempting disaster recovery...');
                // Disaster Recovery: In Phase 7, we salvage what we can.
                // If it's a structural failure, we reset to a clean state.
                this.runtime.initialize();
                this._setInitialContext();
                return { ok: true };
            }

            return hydrateState(this.runtime, wrapper.data);
        } catch (e) {
            // Hard failure if recovery is impossible
            return { ok: false, error: { message: `RECOVERY_FAILED: ${e.message}` } };
        }
    }

    /**
     * Rigid Execution Pipeline:
     * Host Event ➔ dispatch() ➔ projections ➔ serialize ➔ write (FS) ➔ render (UI)
     * @param {number} bufferId
     * @param {any} [patch]
     */
    async handleEvent(bufferId, patch = null) {
        // Scenario C: Writing from the past (Rollback)
        if (this.isPreviewing && this.lastPreviewedTraceId) {
            this.runtime.rollback(this.lastPreviewedTraceId);
            this.isPreviewing = false;
        }

        // 1. Pre-dispatch: Commit ephemeral text if command issued or target is not current focus
        const isCommand = patch && (patch.type === 'COMMAND' || patch.pending_command);
        if (isCommand) {
            await this._commitEphemeralBuffers();
        }

        if (patch) {
             this.runtime.setContext({ ...this.runtime.getContext(), ...patch });
        }

        // 2. Dispatch
        const result = this.runtime.dispatch(bufferId);
        if (!result.ok) {
            console.error('Dispatch failed:', result.error);
            this._renderNotification(`Error: ${result.error.message}`);
            return;
        }

        // 3. Post-dispatch: Rigid Pipeline
        await this._sync(true); // true means structural change
    }

    /**
     * Time Travel: Reconstruct and mirror.
     * @param {number} traceId
     */
    async timeTravel(traceId) {
        const result = this.runtime.reconstructState(traceId);
        if (result.ok) {
            this.isPreviewing = true;
            this.lastPreviewedTraceId = traceId;
            const previewContext = result.value;
            this._render(previewContext);
        }
    }

    /**
     * Update ephemeral buffer (Typing - NO DISPATCH)
     */
    updateEphemeralBuffer(bufferId, content) {
        this.ephemeralTextBuffers.set(bufferId, content);
    }

    /**
     * Synchronize state across projections.
     * @private
     */
    async _sync(isStructural = false) {
        const context = this.runtime.getContext();
        if (isStructural) {
            this.isPreviewing = false;
        }

        // 1. Projections (Internal)
        const stateBlob = exportState(this.runtime);
        this.lastSerializedState = stateBlob;

        // 2. Persistence (Hard Invariant on structural success)
        if (isStructural) {
            await this._persist(stateBlob);
        }

        // 3. Process Management (Shell exclusive)
        await this._checkProcessSpawning();

        // 4. Render (UI)
        this._render(context);
    }

    /**
     * Persistence Layer (FS or IndexedDB)
     * @private
     */
    async _persist(data) {
        const wrapper = {
            version: this.version,
            checksum: this._calculateChecksum(data),
            data: data
        };
        const wrappedBlob = JSON.stringify(wrapper, null, 2);

        if (this.storageMode === 'fs') {
            const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).Neutralino : null;
            if (!NL) return;
            try {
                await NL.filesystem.writeFile(this.tempFile, wrappedBlob);
                await NL.filesystem.move(this.tempFile, this.sessionFile);
            } catch (e) {
                this._renderFatalError('FileSystem Failure: Unable to persist session.');
            }
        } else if (this.storageMode === 'idb') {
            await this._writeToIndexedDB(wrappedBlob);
        }
    }

    /**
     * IndexedDB Internal Methods
     * @private
     */
    async _initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('MetaBufferDB', 1);
            request.onupgradeneeded = (e) => {
                const db = /** @type {any} */ (e.target).result;
                db.createObjectStore('sessions');
            };
            request.onsuccess = (e) => {
                this.db = /** @type {any} */ (e.target).result;
                resolve();
            };
            request.onerror = reject;
        });
    }

    async _readFromIndexedDB() {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readonly');
            const store = transaction.objectStore('sessions');
            const request = store.get('latest');
            request.onsuccess = () => resolve(request.result);
            request.onerror = reject;
        });
    }

    async _writeToIndexedDB(blob) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sessions'], 'readwrite');
            const store = transaction.objectStore('sessions');
            const request = store.put(blob, 'latest');
            request.onsuccess = resolve;
            request.onerror = reject;
        });
    }

    /**
     * Set default context for a fresh system.
     * @private
     */
    _setInitialContext() {
        this.runtime.setContext({
            active_buffers: [1, 2, 7, 8],
            focus_stack: [1, 2],
            focused_buffer_id: 2,
            buffers: {
                1: { id: 1, kind: 'root' },
                2: { id: 2, kind: 'editor', content: '// Welcome to MetaBuffer System\nfunction hello() {\n  console.log("Hello World");\n}' },
                7: { id: 7, kind: 'inspector', metadata: { type: 'transformer' } },
                8: { id: 8, kind: 'inspector', metadata: { type: 'output' } }
            },
            js_source_code: '',
            diagnostics: {},
            suggestions: {},
            runtime_output: [],
            agent_status: 'IDLE',
            run_status: 'IDLE',
            next_buffer_id: 10
        });
    }

    /**
     * Set up Neutralino event listeners for spawned processes.
     * @private
     */
    _setupNativeEventListeners(NL) {
        NL.events.on('spawnedProcess', async (evt) => {
            const { id, action, data } = evt.detail;
            if (this.currentProcess && this.currentProcess.id === id) {
                if (action === 'stdOut') {
                    await this.handleEvent(8, { incoming_output_chunk: { type: 'stdout', text: data } });
                } else if (action === 'stdErr') {
                    await this.handleEvent(8, { incoming_output_chunk: { type: 'stderr', text: data } });
                } else if (action === 'exit') {
                    await this.handleEvent(8, { incoming_output_chunk: { type: 'exit', code: data } });
                    this.currentProcess = null;
                }
            }
        });
    }

    /**
     * Check if an external process needs to be spawned based on kernel state.
     * @private
     */
    async _checkProcessSpawning() {
        const context = this.runtime.getContext();
        if (context.run_status === 'REQUESTED' && !this.currentProcess) {
            const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).Neutralino : null;

            if (!NL) {
                // Mock execution for browser mode
                await this.handleEvent(8, { run_status: 'RUNNING' });
                await this.handleEvent(8, { incoming_output_chunk: { type: 'stdout', text: 'Neutralino not detected. Mocking execution...\n' } });
                await this.handleEvent(8, { incoming_output_chunk: { type: 'stdout', text: `Executing code of length: ${String(context.js_source_code).length}\n` } });
                await this.handleEvent(8, { incoming_output_chunk: { type: 'exit', code: 0 } });
                return;
            }

            try {
                const cmd = `node -e ${JSON.stringify(context.js_source_code)}`;
                this.currentProcess = await NL.os.spawnProcess(cmd);
                await this.handleEvent(8, { run_status: 'RUNNING' });
            } catch (e) {
                await this.handleEvent(8, { incoming_output_chunk: { type: 'stderr', text: `Spawn Failure: ${e.message}\n` } });
                await this.handleEvent(8, { incoming_output_chunk: { type: 'exit', code: 1 } });
            }
        }
    }

    /**
     * Discrete External Analysis Trigger (LSP-style injection)
     * Phase 7: Runs outside core, injects normalized data.
     */
    async triggerExternalAnalysis(lang) {
        const context = this.runtime.getContext();
        const code = projectCode(context);
        let results = [];

        if (lang === 'python') {
            results = pythonAnalyzer.analyze(code);
        } else if (lang === 'java') {
            results = javaAnalyzer.analyze(code);
        }

        // Inject as discrete, inert data
        await this.handleEvent(1, {
            diagnostics: {
                ...context.diagnostics,
                [`ext-${lang}`]: results
            }
        });

        this._renderNotification(`External ${lang} analysis complete.`);
    }

    /**
     * AI Integration (Phase 8: Agentic Boundary Layer)
     */
    async requestAISuggestion() {
        const context = this.runtime.getContext();
        const bufferId = context.focused_buffer_id;
        if (!bufferId) return;

        const code = projectCode(context);
        this.isAiGenerating = true;
        this.activeAISuggestion = { text: '', bufferId, metadata: { agent_name: mockAIAgent.name } };
        this._render(context); // Update UI to show generating state

        try {
            const final = await mockAIAgent.complete(code, {}, (token) => {
                this.activeAISuggestion.text += token;
                this._render(this.runtime.getContext());
            });
            this.activeAISuggestion.text = final;
            this.activeAISuggestion.metadata.timestamp = new Date().toISOString();
        } catch (e) {
            this._renderNotification(`AI Error: ${e.message}`);
            this.activeAISuggestion = null;
        } finally {
            this.isAiGenerating = false;
            this._render(this.runtime.getContext());
        }
    }

    async commitAISuggestion() {
        if (!this.activeAISuggestion) return;
        const { text, bufferId, metadata } = this.activeAISuggestion;

        // Discrete Injection: Single dispatch with final, inert string
        await this.handleEvent(1, {
            pending_command: {
                type: 'COMMIT_SUGGESTION',
                bufferId,
                content: text,
                metadata: {
                    ...metadata,
                    resolution_strategy: 'manual-accept'
                }
            }
        });

        this.activeAISuggestion = null;
        this._sync();
    }

    rejectAISuggestion() {
        this.activeAISuggestion = null;
        this._sync();
    }

    /**
     * Push ephemeral typing to kernel.
     * @private
     */
    async _commitEphemeralBuffers() {
        for (const [id, content] of this.ephemeralTextBuffers) {
            this.runtime.setContext({
                ...this.runtime.getContext(),
                incoming_input: content,
                focused_buffer_id: id
            });
            this.runtime.dispatch(2); // Editor
        }
        this.ephemeralTextBuffers.clear();
    }

    /**
     * Rendering logic: Mirrors the context to UI.
     * Purely mathematical and deterministic.
     * @private
     */
    _render(context) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('shell-render', { detail: {
                workspace: projectWorkspace(context),
                focusedId: context.focused_buffer_id,
                diagnostics: projectDiagnostics(context),
                terminal: projectTerminal(context),
                traces: this.runtime.getTraceStack(),
                isPreview: this.isPreviewing,
                // Phase 8: Volatile state
                aiSuggestion: this.activeAISuggestion,
                isAiGenerating: this.isAiGenerating
            }}));
        }
    }

    _calculateChecksum(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(16);
    }

    async _fileExists(path) {
        const NL = typeof window !== 'undefined' ? window.Neutralino : null;
        if (!NL) return false;
        try {
            const stats = await NL.filesystem.getStats(path);
            return !!stats;
        } catch (e) {
            return false;
        }
    }

    _renderFatalError(msg) {
        console.error('FATAL:', msg);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('shell-error', { detail: msg }));
        }
    }

    _renderNotification(msg) {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('shell-notify', { detail: msg }));
        }
    }
}
