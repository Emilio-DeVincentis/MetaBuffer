// @ts-check

import { exportState, hydrateState } from '../core/serialization.js';
import { dispatch, setContext, reconstructState, rollback, initialize } from '../core/MetaBufferRuntime.js';
import { projectCode, projectWorkspace, projectDiagnostics, projectTerminal, projectInspector } from '../core/projections.js';
import { pythonAnalyzer } from './presets/python.js';
import { javaAnalyzer } from './presets/java.js';
import { mockAIAgent } from './presets/ai.js';

/** @typedef {import('../core/MetaBufferRuntime.js').KernelState} KernelState */
/** @typedef {import('../types/index.js').ExecutionResult} ExecutionResult */

/**
 * Shell handles the bridge between the Kernel and the Host (NeutralinoJS).
 * Implemented as a Factory Function to avoid 'this'.
 *
 * @param {KernelState} initialState
 * @param {Object} [options]
 * @returns {Object}
 */
export function createShell(initialState, options = {}) {
    let kernelState = initialState;
    const sessionFile = './session.json';
    const tempFile = './session.tmp';
    const version = '1.0.0';
    let storageMode = options.storageMode || 'fs';

    let lastSerializedState = null;
    let isPreviewing = false;
    let lastPreviewedTraceId = null;
    const ephemeralTextBuffers = new Map(); // bufferId -> string
    let currentProcess = null;
    let db = null;

    let activeAISuggestion = null;
    let isAiGenerating = false;

    // --- Private Utilities (Bound to closure) ---

    const calculateChecksum = (str) => {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(16);
    };

    const renderNotification = (msg) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('shell-notify', { detail: msg }));
        }
    };

    const renderFatalError = (msg) => {
        console.error('FATAL:', msg);
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('shell-error', { detail: msg }));
        }
    };

    const render = (context) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('shell-render', { detail: {
                workspace: projectWorkspace(context),
                focusedId: context.focused_buffer_id,
                diagnostics: projectDiagnostics(context),
                inspector: projectInspector(context),
                terminal: projectTerminal(context),
                traces: kernelState.traceStack,
                isPreview: isPreviewing,
                aiSuggestion: activeAISuggestion,
                isAiGenerating: isAiGenerating
            }}));
        }
    };

    const fileExists = async (path) => {
        const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).Neutralino : null;
        if (!NL) return false;
        try {
            const stats = await NL.filesystem.getStats(path);
            return !!stats;
        } catch (e) {
            return false;
        }
    };

    const persist = async (data) => {
        const wrapper = {
            version: version,
            checksum: calculateChecksum(data),
            data: data
        };
        const wrappedBlob = JSON.stringify(wrapper, null, 2);

        if (storageMode === 'fs') {
            const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).Neutralino : null;
            if (!NL) return;
            try {
                await NL.filesystem.writeFile(tempFile, wrappedBlob);
                await NL.filesystem.move(tempFile, sessionFile);
            } catch (e) {
                renderFatalError('FileSystem Failure: Unable to persist session.');
            }
        } else if (storageMode === 'idb') {
            if (!db) return;
            await new Promise((resolve, reject) => {
                const transaction = db.transaction(['sessions'], 'readwrite');
                const store = transaction.objectStore('sessions');
                const request = store.put(wrappedBlob, 'latest');
                request.onsuccess = resolve;
                request.onerror = reject;
            });
        }
    };

    const sync = async (isStructural = false) => {
        if (isStructural) {
            isPreviewing = false;
        }

        const stateBlob = exportState(kernelState);
        lastSerializedState = stateBlob;

        if (isStructural) {
            await persist(stateBlob);
        }

        // Process Management (Side effects)
        const context = kernelState.context;
        if (context.run_status === 'REQUESTED' && !currentProcess) {
            const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).Neutralino : null;
            if (!NL) {
                // Mock execution
                await handleEvent(8, { run_status: 'RUNNING' });
                await handleEvent(8, { incoming_output_chunk: { type: 'stdout', text: 'Neutralino not detected. Mocking execution...\n' } });
                await handleEvent(8, { incoming_output_chunk: { type: 'exit', code: 0 } });
            } else {
                try {
                    const cmd = `node -e ${JSON.stringify(context.js_source_code)}`;
                    currentProcess = await NL.os.spawnProcess(cmd);
                    await handleEvent(8, { run_status: 'RUNNING' });
                } catch (e) {
                    await handleEvent(8, { incoming_output_chunk: { type: 'stderr', text: `Spawn Failure: ${e.message}\n` } });
                    await handleEvent(8, { incoming_output_chunk: { type: 'exit', code: 1 } });
                }
            }
        }

        render(kernelState.context);
    };

    const commitEphemeralBuffers = async () => {
        for (const [id, content] of ephemeralTextBuffers) {
            kernelState = setContext(kernelState, {
                ...kernelState.context,
                incoming_input: content,
                focused_buffer_id: id
            });
            const result = dispatch(kernelState, 2);
            if (result.ok && result.state) {
                kernelState = result.state;
            }
        }
        ephemeralTextBuffers.clear();
    };

    const handleEvent = async (bufferId, patch = null) => {
        // 1. Parse / Prepare
        if (isPreviewing && lastPreviewedTraceId) {
            const res = rollback(kernelState, lastPreviewedTraceId);
            if (res.ok && res.state) {
                kernelState = res.state;
                isPreviewing = false;
            }
        }

        const isCommand = patch && (patch.type === 'COMMAND' || patch.pending_command);
        if (isCommand) {
            await commitEphemeralBuffers();
        }

        // 2. Validate & Execute
        if (patch) {
            kernelState = setContext(kernelState, { ...kernelState.context, ...patch });
        }

        const result = dispatch(kernelState, bufferId);
        if (!result.ok) {
            console.error('Dispatch failed:', result.error);
            renderNotification(`Error: ${result.error.message}`);
            return;
        }

        if (result.state) {
            kernelState = result.state;
        }

        // 3. Sync (Persist & Render)
        await sync(true);
    };

    const hydrateWithRecovery = async (blob) => {
        try {
            const wrapper = JSON.parse(blob);
            const expectedChecksum = calculateChecksum(wrapper.data);

            if (wrapper.checksum !== expectedChecksum) {
                renderNotification('WARNING: Corrupted session detected. Resetting to clean state.');
                const res = initialize(kernelState);
                if (res.ok && res.state) kernelState = res.state;
                return { ok: true };
            }

            const res = hydrateState(kernelState, wrapper.data);
            if (res.ok && res.state) {
                kernelState = res.state;
            }
            return res;
        } catch (e) {
            return { ok: false, error: { message: `RECOVERY_FAILED: ${e.message}` } };
        }
    };

    // --- Public API ---

    const shell = {
        boot: async () => {
            const NL = typeof window !== 'undefined' ? /** @type {any} */ (window).Neutralino : null;
            if (!NL && typeof indexedDB !== 'undefined') {
                storageMode = 'idb';
            }

            if (storageMode === 'idb') {
                await new Promise((resolve, reject) => {
                    const request = indexedDB.open('MetaBufferDB', 1);
                    request.onupgradeneeded = (e) => {
                        const db = /** @type {any} */ (e.target).result;
                        db.createObjectStore('sessions');
                    };
                    request.onsuccess = (e) => {
                        db = /** @type {any} */ (e.target).result;
                        resolve();
                    };
                    request.onerror = reject;
                });
            }

            try {
                let blob = null;
                if (storageMode === 'fs' && NL) {
                    if (await fileExists(tempFile)) throw new Error('CRITICAL: session.tmp exists.');
                    if (await fileExists(sessionFile)) {
                        blob = await NL.filesystem.readFile(sessionFile);
                    }
                } else if (storageMode === 'idb') {
                    blob = await new Promise((resolve, reject) => {
                        const transaction = db.transaction(['sessions'], 'readonly');
                        const store = transaction.objectStore('sessions');
                        const request = store.get('latest');
                        request.onsuccess = () => resolve(request.result);
                        request.onerror = reject;
                    });
                }

                if (blob) {
                    const res = await hydrateWithRecovery(blob);
                    if (!res.ok) throw new Error(res.error.message);
                } else {
                    const res = initialize(kernelState);
                    if (res.ok && res.state) kernelState = res.state;

                    // Set initial context if fresh
                    kernelState = setContext(kernelState, {
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
            } catch (e) {
                renderFatalError(`Boot Failure: ${e.message}`);
                return { success: false, error: e };
            }

            if (NL) {
                NL.events.on('spawnedProcess', async (evt) => {
                    const { id, action, data } = evt.detail;
                    if (currentProcess && currentProcess.id === id) {
                        const typeMap = { stdOut: 'stdout', stdErr: 'stderr', exit: 'exit' };
                        const patch = { incoming_output_chunk: { type: typeMap[action], text: data, code: action === 'exit' ? data : undefined } };
                        await handleEvent(8, patch);
                        if (action === 'exit') currentProcess = null;
                    }
                });
            }

            await sync();
            return { success: true };
        },

        handleEvent,

        timeTravel: async (traceId) => {
            const result = reconstructState(kernelState, traceId);
            if (result.ok) {
                isPreviewing = true;
                lastPreviewedTraceId = traceId;
                render(result.value);
            }
        },

        updateEphemeralBuffer: (bufferId, content) => {
            ephemeralTextBuffers.set(bufferId, content);
        },

        requestAISuggestion: async () => {
            const bufferId = kernelState.context.focused_buffer_id;
            if (!bufferId) return;

            const code = projectCode(kernelState.context);
            isAiGenerating = true;
            activeAISuggestion = { text: '', bufferId, metadata: { agent_name: mockAIAgent.name } };
            render(kernelState.context);

            try {
                const final = await mockAIAgent.complete(code, {}, (token) => {
                    activeAISuggestion.text += token;
                    render(kernelState.context);
                });
                activeAISuggestion.text = final;
                activeAISuggestion.metadata.timestamp = new Date().toISOString();
            } catch (e) {
                renderNotification(`AI Error: ${e.message}`);
                activeAISuggestion = null;
            } finally {
                isAiGenerating = false;
                render(kernelState.context);
            }
        },

        commitAISuggestion: async () => {
            if (!activeAISuggestion) return;
            const { text, bufferId, metadata } = activeAISuggestion;
            await handleEvent(1, {
                pending_command: {
                    type: 'COMMIT_SUGGESTION',
                    bufferId,
                    content: text,
                    metadata: { ...metadata, resolution_strategy: 'manual-accept' }
                }
            });
            activeAISuggestion = null;
            await sync();
        },

        rejectAISuggestion: () => {
            activeAISuggestion = null;
            sync();
        },

        triggerExternalAnalysis: async (lang) => {
            const code = projectCode(kernelState.context);
            const analyzer = lang === 'python' ? pythonAnalyzer : (lang === 'java' ? javaAnalyzer : null);
            if (!analyzer) return;

            const results = analyzer.analyze(code);
            await handleEvent(1, {
                diagnostics: {
                    ...kernelState.context.diagnostics,
                    [`ext-${lang}`]: results
                }
            });
            renderNotification(`External ${lang} analysis complete.`);
        }
    };

    return shell;
}
