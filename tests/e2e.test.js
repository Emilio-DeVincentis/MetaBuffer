import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Runtime from '../src/core/MetaBufferRuntime.js';
import { createShell } from '../src/app/Shell.js';
import { rootBuffer } from '../src/buffers/root.js';
import { editorBuffer } from '../src/buffers/editor.js';
import { jsAnalyzerBuffer } from '../src/buffers/jsAnalyzer.js';
import { agentBuffer } from '../src/buffers/agent.js';
import { executorBuffer } from '../src/buffers/executor.js';
import { outputBuffer } from '../src/buffers/output.js';

describe('MetaBuffer System - End-to-End Workflow', () => {
    let sessionData = null;
    let renderCalls = [];

    const setupMocks = () => {
        renderCalls = [];
        global.window = {
            Neutralino: {
                init: vi.fn(),
                filesystem: {
                    writeFile: vi.fn().mockImplementation((path, data) => {
                        if (path === './session.tmp') sessionData = data;
                        return Promise.resolve();
                    }),
                    move: vi.fn().mockResolvedValue(true),
                    readFile: vi.fn().mockImplementation((path) => {
                        if (path === './session.json') return Promise.resolve(sessionData);
                        return Promise.reject(new Error('File not found'));
                    }),
                    getStats: vi.fn().mockImplementation((path) => {
                        if (path === './session.tmp') return Promise.resolve(null);
                        if (path === './session.json' && sessionData) return Promise.resolve({});
                        return Promise.resolve(null);
                    })
                },
                os: {
                    spawnProcess: vi.fn().mockResolvedValue({ id: 123 })
                },
                events: {
                    on: vi.fn()
                }
            },
            dispatchEvent: vi.fn((event) => {
                if (event && event.type === 'shell-render') {
                    renderCalls.push(JSON.parse(JSON.stringify(event.detail)));
                }
            }),
            CustomEvent: class extends Event {
                constructor(type, params) {
                    super(type, params);
                    this.detail = params ? params.detail : null;
                }
            }
        };
    };

    beforeEach(() => {
        sessionData = null;
        setupMocks();
    });

    it('should complete the full user workflow and recover state exactly', async () => {
        vi.useFakeTimers();

        // 1. App boots
        let state = Runtime.createInitialState();
        state = Runtime.registerBuffer(state, rootBuffer);
        state = Runtime.registerBuffer(state, editorBuffer);
        state = Runtime.registerBuffer(state, jsAnalyzerBuffer);
        state = Runtime.registerBuffer(state, agentBuffer);
        state = Runtime.registerBuffer(state, executorBuffer);
        state = Runtime.registerBuffer(state, outputBuffer);

        const shell = createShell(state);
        await shell.boot();

        // Trace 1: Bootstrap

        // 2. User types code in editor
        await shell.handleEvent(2, {
            js_source_code: 'function main() {}',
            buffers: {
                1: {id: 1, kind: 'root'},
                2: { id: 2, kind: 'editor', content: 'function main() {}' }
            }
        });

        // 3. User clicks "Analyze" -> Trace #2
        await shell.handleEvent(1, { pending_command: { type: 'ACTIVATE_BUFFER', bufferId: 3 } });

        // 4. User clicks "GhostWriter"
        const aiPromise = shell.requestAISuggestion();
        await vi.runAllTimersAsync();
        await aiPromise;

        // 5. User accepts suggestion -> Trace #3
        await shell.commitAISuggestion();

        // 6. User clicks "Run" -> Trace #4
        await shell.handleEvent(5, { run_command: 'ACTIVATE' });

        // Verify state before time travel
        let lastDetail = renderCalls[renderCalls.length - 1];

        expect(lastDetail.workspace.find(b => b.id === 2).content).toContain('function main() {}');

        // 7. Time-Travel to Trace[1] (ACTIVATE_BUFFER)
        const targetTraceId = lastDetail.traces[1].id;
        await shell.timeTravel(targetTraceId);

        // Verify preview state
        let previewDetail = renderCalls[renderCalls.length - 1];
        expect(previewDetail.isPreview).toBe(true);

        // 8. Close and Persist
        expect(sessionData).not.toBeNull();

        // 9. Reopen app
        setupMocks();
        let freshState = Runtime.createInitialState();
        freshState = Runtime.registerBuffer(freshState, rootBuffer);
        freshState = Runtime.registerBuffer(freshState, editorBuffer);
        freshState = Runtime.registerBuffer(freshState, jsAnalyzerBuffer);
        freshState = Runtime.registerBuffer(freshState, agentBuffer);
        freshState = Runtime.registerBuffer(freshState, executorBuffer);
        freshState = Runtime.registerBuffer(freshState, outputBuffer);

        const secondShell = createShell(freshState);
        await secondShell.boot();

        const finalRender = renderCalls[renderCalls.length - 1];
        expect(finalRender.workspace.find(b => b.id === 2).content).toContain('function main() {}');

        vi.useRealTimers();
    });
});
