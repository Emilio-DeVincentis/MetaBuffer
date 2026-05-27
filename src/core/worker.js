// @ts-check
import { PieceTable } from './storage/PieceTable.js';
import { LineManager } from './storage/LineManager.js';
import { UndoManager } from './storage/UndoManager.js';
import { Scheduler } from './worker/Scheduler.js';
import { tokenize } from './worker/Tokenizer.js';

/**
 * @typedef {Object} BufferState
 * @property {number} id
 * @property {PieceTable} pieceTable
 * @property {LineManager} lineManager
 * @property {UndoManager} undoManager
 * @property {number} version
 * @property {number} selectionAnchor
 * @property {number} selectionHead
 * @property {any} currentAst
 * @property {number} astVersion
 */

// --- Worker State ---
/** @type {Map<number, BufferState>} */
const buffers = new Map();
/** @type {number[]} */
let activeBufferIds = [];
/** @type {number | null} */
let focusedBufferId = null;
let nextBufferId = 1;

const scheduler = new Scheduler();
let plugins = [];

// --- Auto-Save ---
setInterval(() => {
    const savedStates = Array.from(buffers.values()).map(b => ({
        id: b.id,
        originalBuffer: b.pieceTable.originalBuffer,
        addBuffer: b.pieceTable.addBuffer,
        pieces: b.pieceTable.pieces,
        version: b.version
    }));
    self.postMessage({
        type: 'CORE/AUTO_SAVE',
        payload: {
            buffers: savedStates,
            activeBufferIds,
            focusedBufferId
        }
    });
}, 10000);

// --- Heartbeat ---
setInterval(() => {
    self.postMessage({ type: 'CORE/HEARTBEAT', payload: { timestamp: Date.now() } });
}, 1000);

// --- Tree-sitter Infrastructure ---
// In a real environment, we'd import the WASM parser here
// For this MVP, we provide a unified incremental parsing interface
const AST_REGISTRY = new Map();

async function initTreeSitter() {
    console.log('Tree-sitter infrastructure ready');
}
initTreeSitter();

function updateIncrementalAST(bufferId, start, end, text, version) {
    // Strategy: Drop stale results if version changed since background task was queued
    scheduler.enqueue(() => {
        const b = buffers.get(bufferId);
        if (!b || b.version !== version) return;

        // Perform incremental parse
        // For MVP, we simulate semantic token extraction
        const semanticTokens = [];
        AST_REGISTRY.set(bufferId, { version, tokens: semanticTokens });

        // Refine Frame if version still matches
        broadcastFrame();
    }, 'background');
}

// --- API Helpers ---

function createBuffer(content = '', id = null) {
    const bufferId = id || nextBufferId++;
    const state = {
        id: bufferId,
        pieceTable: new PieceTable(content),
        lineManager: new LineManager(content),
        undoManager: new UndoManager(),
        version: 0,
        selectionAnchor: 0,
        selectionHead: 0,
        currentAst: null,
        astVersion: -1
    };
    buffers.set(bufferId, state);
    return bufferId;
}

// --- API Handlers ---

const handlers = {
    'BUFFER/INIT': ({ content }) => {
        buffers.clear();
        const id = createBuffer(content);
        activeBufferIds = [id];
        focusedBufferId = id;
        broadcastFrame();
    },

    'BUFFER/CREATE': ({ content = '' }) => {
        const id = createBuffer(content);
        activeBufferIds.push(id);
        focusedBufferId = id;
        broadcastFrame();
    },

    'BUFFER/FOCUS': ({ id }) => {
        if (buffers.has(id)) {
            focusedBufferId = id;
            broadcastFrame();
        }
    },

    'BUFFER/CLOSE': ({ id }) => {
        buffers.delete(id);
        activeBufferIds = activeBufferIds.filter(bid => bid !== id);
        if (focusedBufferId === id) {
            focusedBufferId = activeBufferIds[activeBufferIds.length - 1] || null;
        }
        broadcastFrame();
    },

    'BUFFER/CURSOR_MOVE': ({ bufferId, offset, select }) => {
        const b = buffers.get(bufferId || focusedBufferId);
        if (!b) return;

        const targetOffset = Math.max(0, Math.min(offset, b.pieceTable.length));
        b.selectionHead = targetOffset;
        if (!select) {
            b.selectionAnchor = targetOffset;
        }
        broadcastFrame();
    },

    'BUFFER/MOUSE_CLICK': ({ bufferId, line, col, select }) => {
        const b = buffers.get(bufferId || focusedBufferId);
        if (!b) return;

        const lineCount = b.lineManager.lineOffsets.length;
        const targetLine = Math.max(0, Math.min(line, lineCount - 1));
        const lineStart = b.lineManager.lineOffsets[targetLine];
        const lineEnd = targetLine + 1 < lineCount ? b.lineManager.lineOffsets[targetLine + 1] : b.pieceTable.length;

        const maxCol = Math.max(0, lineEnd - lineStart - (targetLine + 1 < lineCount ? 1 : 0));
        const targetOffset = lineStart + Math.max(0, Math.min(col, maxCol));

        b.selectionHead = targetOffset;
        if (!select) {
            b.selectionAnchor = targetOffset;
            focusedBufferId = b.id; // Focus on click
        }
        broadcastFrame();
    },

    'BUFFER/MUTATE': ({ bufferId, start = 0, end = 0, text = '', version }) => {
        const b = buffers.get(bufferId || focusedBufferId);
        if (!b) return;

        const capturedVersion = ++b.version;
        scheduler.enqueue(() => {
            plugins.forEach(p => p.beforeChange?.(b.pieceTable, start, end, text));

            const lengthToDelete = end - start;
            if (lengthToDelete > 0) {
                const deletedText = b.pieceTable.slice(start, end);
                b.pieceTable.delete(start, lengthToDelete);
                b.lineManager.onDelete(start, lengthToDelete, deletedText);
                b.undoManager.push({ type: 'delete', start, length: lengthToDelete, text: deletedText });
            }
            if (text.length > 0) {
                b.pieceTable.insert(start, text);
                b.lineManager.onInsert(start, text);
                b.undoManager.push({ type: 'insert', start, length: text.length, text });
            }

            b.selectionHead = start + text.length;
            b.selectionAnchor = b.selectionHead;

            plugins.forEach(p => p.afterChange?.(b.pieceTable, start, end, text));
            broadcastFrame();

            updateIncrementalAST(b.id, start, end, text, capturedVersion);
        }, 'input');
    },

    'BUFFER/UNDO': ({ bufferId }) => {
        const b = buffers.get(bufferId || focusedBufferId);
        if (!b) return;

        const record = b.undoManager.popUndo();
        if (record) {
            if (record.type === 'insert') {
                b.pieceTable.delete(record.start, record.length);
                b.lineManager.onDelete(record.start, record.length, record.text);
            } else {
                b.pieceTable.insert(record.start, record.text);
                b.lineManager.onInsert(record.start, record.text);
            }
            b.version++;
            broadcastFrame();
        }
    },

    'CORE/FOCUS_NAV': ({ direction }) => {
        if (activeBufferIds.length === 0) return;
        const currentIndex = activeBufferIds.indexOf(focusedBufferId);
        let nextIndex = (currentIndex + direction) % activeBufferIds.length;
        if (nextIndex < 0) nextIndex = activeBufferIds.length - 1;
        focusedBufferId = activeBufferIds[nextIndex];
        broadcastFrame();
    }
};

function broadcastFrame() {
    scheduler.enqueue(() => {
        const bufferSnapshots = activeBufferIds.map(id => {
            const b = buffers.get(id);
            if (!b) return null;

            const startLine = 0;
            const endLine = b.lineManager.lineOffsets.length;

            // htmlFrameChunk: a single string containing all lines
            let htmlFrameChunk = '';
            const lineVersions = [];

            for (let i = startLine; i < endLine; i++) {
                const start = b.lineManager.lineOffsets[i];
                const end = i + 1 < b.lineManager.lineOffsets.length ? b.lineManager.lineOffsets[i+1] : b.pieceTable.length;
                let rawContent = b.pieceTable.slice(start, end);

                plugins.forEach(p => {
                    if (p.renderLine) rawContent = p.renderLine(i, rawContent);
                });

                const htmlContent = tokenize(rawContent);
                const selStart = Math.min(b.selectionAnchor, b.selectionHead);
                const selEnd = Math.max(b.selectionAnchor, b.selectionHead);
                const relSelStart = Math.max(0, Math.min(selStart - start, end - start));
                const relSelEnd = Math.max(0, Math.min(selEnd - start, end - start));

                let selectionHtml = '';
                if (relSelStart < relSelEnd) {
                    selectionHtml = `<div class="emacs-selection" style="position: absolute; top: 0; height: 100%; left: ${relSelStart * 8.4}px; width: ${(relSelEnd - relSelStart) * 8.4}px; background-color: rgba(0, 122, 204, 0.3); pointer-events: none;"></div>`;
                }

                htmlFrameChunk += `<div class="view-line" data-line-index="${i}" data-version="${b.lineManager.lineVersions[i]}" style="position: absolute; top: 0; left: 0; transform: translate3d(0, ${i * 19}px, 0);">${htmlContent}${selectionHtml}</div>`;
                lineVersions.push(b.lineManager.lineVersions[i]);
            }

            const cursorLine = b.lineManager.getLineIndex(b.selectionHead);
            const cursorCol = b.selectionHead - b.lineManager.lineOffsets[cursorLine];

            return {
                id,
                version: b.version,
                htmlFrameChunk,
                lineVersions,
                cursor: { line: cursorLine, column: cursorCol }
            };
        }).filter(Boolean);

        self.postMessage({
            type: 'UI/FLUSH_FRAME',
            payload: {
                focusedBufferId,
                buffers: bufferSnapshots
            }
        });
    }, 'render');
}

self.onmessage = (e) => {
    const { type, payload = {} } = e.data;
    const handler = handlers[type];
    if (handler) {
        handler(payload);
    }
};
