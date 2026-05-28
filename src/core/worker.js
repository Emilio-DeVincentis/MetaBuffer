// @ts-check
import { PieceTable } from './storage/PieceTable.js';
import { LineManager } from './storage/LineManager.js';
import { UndoManager } from './storage/UndoManager.js';
import { Scheduler } from './worker/Scheduler.js';
import { tokenize } from './worker/Tokenizer.js';
import { TraceRepository } from './TraceRepository.js';

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
 * @property {number} scrollTop
 * @property {number} viewHeight
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
const traceRepo = new TraceRepository();
let plugins = [];

// --- Auto-Save ---
setInterval(() => {
    if (buffers.size === 0) return;
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
        astVersion: -1,
        scrollTop: 0,
        viewHeight: 800
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
        traceRepo.append(id, 'BOOTSTRAP', { content });
        broadcastFrame();
    },

    'BUFFER/CREATE': ({ content = '' }) => {
        const id = createBuffer(content);
        activeBufferIds.push(id);
        focusedBufferId = id;
        traceRepo.append(id, 'BUFFER_CREATE', { content });
        broadcastFrame();
    },

    'BUFFER/FOCUS': ({ id }) => {
        if (buffers.has(id)) {
            const oldFocus = focusedBufferId;
            focusedBufferId = id;
            traceRepo.append(id, 'FOCUS_SHIFT', { from: oldFocus, to: id });
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

    'BUFFER/VIEWPORT_UPDATE': ({ bufferId, scrollTop, viewHeight }) => {
        const b = buffers.get(bufferId);
        if (b) {
            b.scrollTop = scrollTop;
            b.viewHeight = viewHeight;
            broadcastFrame();
        }
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
            // Reaction Pipeline Pass: signals emitted during this cycle
            const signals = [];
            const emit = (kind, payload) => signals.push({ kind, payload });

            plugins.forEach(p => {
                const startT = performance.now();
                p.beforeChange?.(b.pieceTable, start, end, text, emit);
                const duration = performance.now() - startT;
                if (duration > 2) console.warn(`Plugin performance penalty: beforeChange took ${duration.toFixed(2)}ms`);
            });

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

            plugins.forEach(p => {
                const startT = performance.now();
                p.afterChange?.(b.pieceTable, start, end, text, emit);
                const duration = performance.now() - startT;
                if (duration > 2) console.warn(`Plugin performance penalty: afterChange took ${duration.toFixed(2)}ms`);
            });

            // Secondary Reaction Pass: allow plugins to react to emitted signals
            if (signals.length > 0) {
                plugins.forEach(p => {
                    if (p.onSignal) {
                        signals.forEach(s => p.onSignal(s.kind, s.payload, b.pieceTable, emit));
                    }
                });
            }

            broadcastFrame();

            updateIncrementalAST(b.id, start, end, text, capturedVersion);
        }, 'input');
    },

    'BUFFER/SET_MARKER': ({ bufferId, id, offset, affinity }) => {
        const b = buffers.get(bufferId || focusedBufferId);
        if (b) {
            b.pieceTable.setMarker(id, offset, affinity);
            broadcastFrame();
        }
    },

    'PLUGIN/REGISTER_COMMAND': ({ name, handlerCode }) => {
        try {
            // Simplified for MVP: Handler is a string that we can call
            // In a real system, this would be a structured plugin message
            handlers[name] = () => { console.log(`Executing plugin command: ${name}`); };
        } catch (e) {
            console.error('Failed to register plugin command', e);
        }
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

    'BUFFER/REDO': ({ bufferId }) => {
        const b = buffers.get(bufferId || focusedBufferId);
        if (!b) return;

        const record = b.undoManager.popRedo();
        if (record) {
            if (record.type === 'insert') {
                b.pieceTable.insert(record.start, record.text);
                b.lineManager.onInsert(record.start, record.text);
            } else {
                b.pieceTable.delete(record.start, record.length);
                b.lineManager.onDelete(record.start, record.length, record.text);
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
    },

    'CORE/REQUEST_SAVE': () => {
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
    },

    'CORE/HYDRATE': (payload) => {
        const { buffers: savedBuffers, activeBufferIds: savedActiveIds, focusedBufferId: savedFocusedId } = payload;

        buffers.clear();
        savedBuffers.forEach(b => {
            const id = b.id;
            const pieceTable = new PieceTable(b.originalBuffer);
            pieceTable.addBuffer = b.addBuffer;
            // PieceTable.hydrate reconstructs the tree from pieces
            pieceTable.hydrate(b);

            const content = pieceTable.slice(0, pieceTable.length);
            const lineManager = new LineManager(content);

            buffers.set(id, {
                id,
                pieceTable,
                lineManager,
                undoManager: new UndoManager(),
                version: b.version || 0,
                selectionAnchor: 0,
                selectionHead: 0,
                currentAst: null,
                astVersion: -1,
                scrollTop: 0,
                viewHeight: 800
            });

            if (id >= nextBufferId) nextBufferId = id + 1;
        });

        activeBufferIds = savedActiveIds || [];
        focusedBufferId = savedFocusedId || (activeBufferIds.length > 0 ? activeBufferIds[0] : null);

        broadcastFrame();
    }
};

function broadcastFrame() {
    scheduler.enqueue(() => {
        const bufferSnapshots = activeBufferIds.map(id => {
            const b = buffers.get(id);
            if (!b) return null;

            const LINE_HEIGHT = 19;
            const startLine = Math.max(0, Math.floor(b.scrollTop / LINE_HEIGHT) - 5);
            const endLine = Math.min(b.lineManager.lineOffsets.length, Math.ceil((b.scrollTop + b.viewHeight) / LINE_HEIGHT) + 5);

            const lines = [];
            const astData = AST_REGISTRY.get(id);

            for (let i = startLine; i < endLine; i++) {
                const start = b.lineManager.lineOffsets[i];
                const end = i + 1 < b.lineManager.lineOffsets.length ? b.lineManager.lineOffsets[i+1] : b.pieceTable.length;
                let rawContent = b.pieceTable.slice(start, end);

                plugins.forEach(p => {
                    if (p.renderLine) {
                        const startT = performance.now();
                        rawContent = p.renderLine(i, rawContent);
                        const duration = performance.now() - startT;
                        if (duration > 2) console.warn(`Plugin performance penalty: renderLine took ${duration.toFixed(2)}ms`);
                    }
                });

                let htmlContent;
                if (astData && astData.version === b.version) {
                    const semanticRaw = rawContent.replace(/\bfunction\b/g, (match) => `<span class="t-semantic-function">${match}</span>`);
                    htmlContent = tokenize(semanticRaw);
                } else {
                    htmlContent = tokenize(rawContent);
                }

                const selStart = Math.min(b.selectionAnchor, b.selectionHead);
                const selEnd = Math.max(b.selectionAnchor, b.selectionHead);
                const relSelStart = Math.max(0, Math.min(selStart - start, end - start));
                const relSelEnd = Math.max(0, Math.min(selEnd - start, end - start));

                let selectionHtml = '';
                if (relSelStart < relSelEnd) {
                    selectionHtml = `<div class="emacs-selection" style="position: absolute; top: 0; height: 100%; left: ${relSelStart * 8.4}px; width: ${(relSelEnd - relSelStart) * 8.4}px; background-color: rgba(0, 122, 204, 0.3); pointer-events: none;"></div>`;
                }

                let markerHtml = '';
                for (const [mid, marker] of b.pieceTable.markers) {
                    const mOffset = b.pieceTable.getMarkerOffset(mid);
                    if (mOffset >= start && mOffset < end) {
                        const relMOffset = mOffset - start;
                        markerHtml += `<div class="emacs-marker" data-marker-id="${mid}" style="position: absolute; top: 0; height: 100%; left: ${relMOffset * 8.4}px; width: 2px; background-color: var(--success-color); opacity: 0.8; pointer-events: none;"></div>`;
                    }
                }

                lines.push({
                    index: i,
                    version: b.lineManager.lineVersions[i],
                    html: htmlContent + selectionHtml + markerHtml
                });
            }

            const cursorLine = b.lineManager.getLineIndex(b.selectionHead);
            const cursorCol = b.selectionHead - b.lineManager.lineOffsets[cursorLine];

            return {
                id,
                version: b.version,
                lines,
                cursor: { line: cursorLine, column: cursorCol }
            };
        }).filter(Boolean);

        // Spatial Inspector Data
        const inspectorData = {
            totalBuffers: buffers.size,
            activeCount: activeBufferIds.length,
            traceCount: traceRepo.records.length,
            workerUptime: performance.now()
        };

        self.postMessage({
            type: 'UI/FLUSH_FRAME',
            payload: {
                focusedBufferId,
                buffers: bufferSnapshots,
                traces: traceRepo.getHistory(),
                inspector: inspectorData
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
