// @ts-check

import { exportState, hydrateState } from '../core/serialization.js';
import { projectCode, projectWorkspace, projectDiagnostics, projectTerminal } from '../core/projections.js';

/** @typedef {import('../core/MetaBufferRuntime.js').MetaBufferRuntime} MetaBufferRuntime */
/** @typedef {import('../types/index.js').ExecutionResult} ExecutionResult */

export class Shell {
    /**
     * @param {MetaBufferRuntime} runtime
     */
    constructor(runtime) {
        this.runtime = runtime;
        this.sessionFile = './session.json';
        this.tempFile = './session.tmp';
        this.version = '1.0.0';

        /** @private */
        this.lastSerializedState = null;
        /** @private */
        this.isPreviewing = false;
        /** @private */
        this.ephemeralTextBuffers = new Map(); // bufferId -> string
    }

    /**
     * Boot the shell: validate integrity and hydrate.
     */
    async boot() {
        const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).NL_ : null;
        if (!NL) return { success: true };

        // 1. Crash Check: Integrity Invariant
        try {
            const tmpExists = await this._fileExists(this.tempFile);
            if (tmpExists) {
                throw new Error('CRITICAL_INTEGRITY_FAILURE: session.tmp detected. Potential crash during last I/O.');
            }
        } catch (e) {
            this._renderFatalError(e.message);
            return { success: false, error: e };
        }

        // 2. Hydration
        try {
            const sessionExists = await this._fileExists(this.sessionFile);
            if (sessionExists) {
                const blob = await NL.filesystem.readFile(this.sessionFile);
                const wrapper = JSON.parse(blob);

                // Validate Header & Checksum (Simple implementation for MVP)
                if (wrapper.version !== this.version) {
                    throw new Error('VERSION_MISMATCH: Incompatible session file.');
                }

                const expectedChecksum = this._calculateChecksum(wrapper.data);
                if (wrapper.checksum !== expectedChecksum) {
                    throw new Error('CHECKSUM_MISMATCH: Session data is corrupted.');
                }

                const res = hydrateState(this.runtime, wrapper.data);
                if (!res.ok) throw new Error(res.error.message);
            } else {
                this.runtime.initialize();
            }
        } catch (e) {
            this._renderFatalError(`Boot Failure: ${e.message}`);
            return { success: false, error: e };
        }

        this._sync();
        return { success: true };
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
        // Best-effort render for typing responsiveness
        // Note: Does not touch the kernel or FS
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

        // 3. Render (UI)
        this._render(context);
    }

    /**
     * Atomic Write-Temp + Rename Pattern
     * @private
     */
    async _persist(data) {
        const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).NL_ : null;
        if (!NL) return;

        try {
            const wrapper = {
                version: this.version,
                checksum: this._calculateChecksum(data),
                data: data
            };
            const wrappedBlob = JSON.stringify(wrapper, null, 2);

            await NL.filesystem.writeFile(this.tempFile, wrappedBlob);
            await NL.filesystem.moveFile(this.tempFile, this.sessionFile);
        } catch (e) {
            console.error('Persistence failed:', e);
            this._renderFatalError('FileSystem Failure: Unable to persist session.');
        }
    }

    /**
     * Push ephemeral typing to kernel.
     * @private
     */
    async _commitEphemeralBuffers() {
        for (const [id, content] of this.ephemeralTextBuffers) {
            // Ideally we'd have a 'SET_CONTENT' command or similar.
            // For Phase 6, we use the existing UI_INPUT/Buffer context pattern.
            // But we must do it via the bridge's logic.
            // Actually, we can just inject into context and dispatch Root or Editor.
            this.runtime.setContext({
                ...this.runtime.getContext(),
                incoming_input: content, // This might need refinement based on how Editor.js works in Phase 4
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
        // This method will be bridged to the actual DOM/CodeMirror views in the UI layer.
        // It acts as the distribution hub for projections.
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('shell-render', { detail: {
                workspace: projectWorkspace(context),
                focusedId: context.focused_buffer_id,
                diagnostics: projectDiagnostics(context),
                terminal: projectTerminal(context),
                traces: this.runtime.getTraceStack(),
                isPreview: this.isPreviewing
            }}));
        }
    }

    _calculateChecksum(str) {
        // Suckless Checksum: Simple hash
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(16);
    }

    async _fileExists(path) {
        const NL = typeof window !== 'undefined' ? window.NL_ : null;
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
