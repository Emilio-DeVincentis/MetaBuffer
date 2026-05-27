import { describe, it, expect, beforeEach } from 'vitest';
import { createInitialState, registerBuffer, dispatch, setContext } from '../src/core/MetaBufferRuntime.js';

describe('MetaBuffer System Invariants', () => {
    let state;

    beforeEach(() => {
        state = createInitialState();
    });

    it('Invariant 1: Monism - Every feature is a MetaBuffer', () => {
        // Verification of architecture by checking registration of diverse roles
        const mockRoot = { id: 1, parentId: null, scope: ['*'], apply: () => ({ delta: { patch: {} }, trace: null }) };
        const mockEditor = { id: 2, parentId: 1, scope: ['text'], apply: () => ({ delta: { patch: {} }, trace: null }) };
        const mockAgent = { id: 4, parentId: 1, scope: ['agent'], apply: () => ({ delta: { patch: {} }, trace: null }) };

        state = registerBuffer(state, mockRoot);
        state = registerBuffer(state, mockEditor);
        state = registerBuffer(state, mockAgent);

        expect(state.buffers.size).toBe(3);
        expect(state.buffers.get(1)).toBe(mockRoot);
        expect(state.buffers.get(2)).toBe(mockEditor);
        expect(state.buffers.get(4)).toBe(mockAgent);
    });

    it('Invariant 2: Traceability - Structural changes emit Traces', () => {
        const structuralBuffer = {
            id: 1,
            parentId: null,
            scope: ['focused_id'],
            apply: (view) => ({
                delta: { patch: { focused_id: 2 } },
                trace: {} // Structural intent
            })
        };

        state = registerBuffer(state, structuralBuffer);
        state = setContext(state, { focused_id: 1 });

        const result = dispatch(state, 1);
        expect(result.ok).toBe(true);
        expect(result.state.traceStack.length).toBe(1);
        expect(result.state.traceStack[0].metaBufferId).toBe(1);
    });

    it('Invariant 3: Separation - Logical kernel remains pure', () => {
        // This is a design invariant. We test it by ensuring dispatch doesn't
        // require any external IO or async and returns a pure result.
        const buffer = {
            id: 1,
            parentId: null,
            scope: ['key'],
            apply: (view) => ({ delta: { patch: { key: 'value' } }, trace: null })
        };
        state = registerBuffer(state, buffer);

        const result = dispatch(state, 1);
        expect(result.ok).toBe(true);
        expect(result.state.context.key).toBe('value');
    });

    it('Invariant 4: Scope Isolation - Buffers cannot access or write outside scope', () => {
        const mockRoot = { id: 1, parentId: null, scope: ['*'], apply: () => ({ delta: { patch: {} }, trace: null }) };
        state = registerBuffer(state, mockRoot);

        const maliciousBuffer = {
            id: 2,
            parentId: 1,
            scope: ['public_key'],
            apply: (view) => {
                // Attempt to see private data
                const seenPrivate = view.state.private_key;
                // Attempt to write private data
                return {
                    delta: { patch: { private_key: 'hacked', public_key: 'updated' } },
                    trace: null
                };
            }
        };

        state = registerBuffer(state, maliciousBuffer);
        state = setContext(state, { public_key: 'orig', private_key: 'secret' });

        const result = dispatch(state, 2);
        expect(result.ok).toBe(true);
        // Should NOT have updated private_key
        expect(result.state.context.private_key).toBe('secret');
        // Should HAVE updated public_key
        expect(result.state.context.public_key).toBe('updated');
    });
});
