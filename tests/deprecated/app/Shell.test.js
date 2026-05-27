import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createShell } from '../../src/app/Shell.js';
import * as Runtime from '../../src/core/MetaBufferRuntime.js';
import { exportState } from '../../src/core/serialization.js';

describe('Shell - Host Bridge & Isolation', () => {
    let runtimeState;
    let shell;

    beforeEach(() => {
        runtimeState = Runtime.createInitialState();
        // Mock Neutralino
        global.window = {
            Neutralino: {
                filesystem: {
                    writeFile: vi.fn().mockResolvedValue(true),
                    move: vi.fn().mockResolvedValue(true),
                    readFile: vi.fn().mockResolvedValue(JSON.stringify({
                        version: '1.0.0',
                        checksum: '0',
                        data: exportState(Runtime.createInitialState())
                    })),
                    getStats: vi.fn().mockResolvedValue(true)
                },
                os: {
                    spawnProcess: vi.fn().mockResolvedValue({ id: 123, pid: 456 })
                },
                events: {
                    on: vi.fn()
                }
            },
            dispatchEvent: vi.fn(),
            CustomEvent: class { constructor(name, detail) { this.name = name; this.detail = detail; } }
        };
        shell = createShell(runtimeState);
    });

    it('should implement atomic persistence (write-temp + move)', async () => {
        runtimeState = Runtime.registerBuffer(runtimeState, { id: 1, scope: ['*'], apply: () => ({ delta: { patch: { x: 1 } }, trace: { id: 0 } }) });

        shell = createShell(runtimeState);
        await shell.handleEvent(1, { some: 'patch' });

        const NL = global.window.Neutralino;
        expect(NL.filesystem.writeFile).toHaveBeenCalledWith('./session.tmp', expect.any(String));
        expect(NL.filesystem.move).toHaveBeenCalledWith('./session.tmp', './session.json');
    });

    it('should spawn process only in requested status and manage isolation', async () => {
        runtimeState = Runtime.registerBuffer(runtimeState, { id: 8, scope: ['*'], apply: (view) => {
            if (view.state.run_status === 'REQUESTED') return { delta: { patch: { run_status: 'RUNNING' } }, trace: null };
            return { delta: { patch: {} }, trace: null };
        }});
        runtimeState = Runtime.initialize(runtimeState).state;
        runtimeState = Runtime.setContext(runtimeState, { run_status: 'REQUESTED', js_source_code: 'console.log(1)' });

        shell = createShell(runtimeState);
        await shell.handleEvent(8);

        const NL = global.window.Neutralino;
        expect(NL.os.spawnProcess).toHaveBeenCalledWith(expect.stringContaining('node -e'));
    });

    it('should commit ephemeral buffers discretely', async () => {
        runtimeState = Runtime.registerBuffer(runtimeState, { id: 1, scope: ['*'], apply: () => ({ delta: { patch: {} }, trace: { id: 10 } }) });
        runtimeState = Runtime.registerBuffer(runtimeState, { id: 2, scope: ['*'], apply: () => ({ delta: { patch: {} }, trace: null }) });
        runtimeState = Runtime.initialize(runtimeState).state;

        shell = createShell(runtimeState);
        shell.updateEphemeralBuffer(2, 'new content');

        await shell.handleEvent(1, { pending_command: { type: 'SOME_COMMAND' } });

        const NL = global.window.Neutralino;
        expect(NL.filesystem.writeFile).toHaveBeenCalled();
    });
});
