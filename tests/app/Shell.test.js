import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Shell } from '../../src/app/Shell.js';
import { MetaBufferRuntime } from '../../src/core/MetaBufferRuntime.js';

describe('Shell - Host Bridge & Isolation', () => {
    let runtime;
    let shell;

    beforeEach(() => {
        runtime = new MetaBufferRuntime();
        shell = new Shell(runtime);
        // Mock Neutralino
        global.window = {
            Neutralino: {
                filesystem: {
                    writeFile: vi.fn().mockResolvedValue(true),
                    move: vi.fn().mockResolvedValue(true),
                    readFile: vi.fn().mockResolvedValue(JSON.stringify({
                        version: '1.0.0',
                        checksum: '0',
                        data: {}
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
    });

    it('should implement atomic persistence (write-temp + move)', async () => {
        // @ts-ignore
        await shell._persist('test-data');
        const NL = global.window.Neutralino;
        expect(NL.filesystem.writeFile).toHaveBeenCalledWith('./session.tmp', expect.any(String));
        expect(NL.filesystem.move).toHaveBeenCalledWith('./session.tmp', './session.json');
    });

    it('should spawn process only in requested status and manage isolation', async () => {
        runtime.registerBuffer({ id: 8, scope: ['*'], apply: () => ({ delta: { patch: {} }, trace: null }) });
        runtime.initialize();
        runtime.setContext({ run_status: 'REQUESTED', js_source_code: 'console.log(1)' });

        // @ts-ignore
        await shell._checkProcessSpawning();

        const NL = global.window.Neutralino;
        expect(NL.os.spawnProcess).toHaveBeenCalledWith(expect.stringContaining('node -e'));
        expect(shell.currentProcess).not.toBeNull();
    });

    it('should commit ephemeral buffers discretely', async () => {
        shell.updateEphemeralBuffer(2, 'new content');
        expect(shell.ephemeralTextBuffers.get(2)).toBe('new content');

        // Mock runtime dispatch
        runtime.registerBuffer({ id: 1, scope: ['*'], apply: () => ({ delta: { patch: {} }, trace: { id: 10 } }) });
        runtime.registerBuffer({ id: 2, scope: ['*'], apply: () => ({ delta: { patch: {} }, trace: null }) });

        await shell.handleEvent(1, { pending_command: { type: 'SOME_COMMAND' } });

        expect(shell.ephemeralTextBuffers.size).toBe(0);
        expect(runtime.getContext().incoming_input).toBe('new content');
    });
});
