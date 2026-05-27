// @ts-check
import { PieceTable } from './storage/PieceTable.js';
import { LineManager } from './storage/LineManager.js';
import { UndoManager } from './storage/UndoManager.js';
import { Scheduler } from './worker/Scheduler.js';
import { tokenize } from './worker/Tokenizer.js';

// --- Worker State ---
let pieceTable = new PieceTable('');
let lineManager = new LineManager('');
let undoManager = new UndoManager();
const scheduler = new Scheduler();

let bufferVersion = 0;
let plugins = [];
let selectionAnchor = 0;
let selectionHead = 0;

// Tree-sitter AST State
let currentAst = null;
let astVersion = -1;

// --- Auto-Save ---
setInterval(() => {
    self.postMessage({
        type: 'CORE/AUTO_SAVE',
        payload: {
            originalBuffer: pieceTable.originalBuffer,
            addBuffer: pieceTable.addBuffer,
            pieces: pieceTable.pieces,
            version: bufferVersion
        }
    });
}, 10000);

// --- Heartbeat ---
setInterval(() => {
    self.postMessage({ type: 'CORE/HEARTBEAT', payload: { timestamp: Date.now() } });
}, 1000);

// --- Tree-sitter (Placeholder for v1) ---
async function initTreeSitter() {
    // Parser initialization would go here
    console.log('Tree-sitter infrastructure ready');
}
initTreeSitter();

// --- API ---

const handlers = {
    'CORE/HYDRATE': (state) => {
        pieceTable.hydrate(state);
        // Regenerate line manager from hydrated text
        const fullText = pieceTable.slice(0, pieceTable.length);
        lineManager = new LineManager(fullText);
        bufferVersion = state.version || 0;
        broadcastFrame();
    },

    'PLUGIN/REGISTER': ({ code }) => {
        // eval() removed for security.
        // In V1, we simulate plugin registration by accepting predefined logic
        // or using a safer alternative if required.
        console.warn('PLUGIN/REGISTER via eval() is disabled for security.');
    },

    'BUFFER/INIT': ({ content }) => {
        pieceTable = new PieceTable(content);
        lineManager = new LineManager(content);
        undoManager = new UndoManager();
        bufferVersion = 0;
        broadcastFrame();
    },

    'BUFFER/CURSOR_MOVE': ({ offset, select }) => {
        const targetOffset = Math.max(0, Math.min(offset, pieceTable.length));
        selectionHead = targetOffset;
        if (!select) {
            selectionAnchor = targetOffset;
        }
        broadcastFrame();
    },

    'BUFFER/MOUSE_CLICK': ({ line, col, select }) => {
        const lineCount = lineManager.lineOffsets.length;
        const targetLine = Math.max(0, Math.min(line, lineCount - 1));
        const lineStart = lineManager.lineOffsets[targetLine];
        const lineEnd = targetLine + 1 < lineCount ? lineManager.lineOffsets[targetLine + 1] : pieceTable.length;

        // Offset within the line (clamped by line length excluding potential newline)
        const maxCol = Math.max(0, lineEnd - lineStart - (targetLine + 1 < lineCount ? 1 : 0));
        const targetOffset = lineStart + Math.max(0, Math.min(col, maxCol));

        selectionHead = targetOffset;
        if (!select) {
            selectionAnchor = targetOffset;
        }
        broadcastFrame();
    },

    'BUFFER/MUTATE': ({ start = 0, end = 0, text = '', version }) => {
        const capturedVersion = ++bufferVersion;
        scheduler.enqueue(() => {
            // Plugin Hook: beforeChange
            plugins.forEach(p => p.beforeChange?.(pieceTable, start, end, text));

            const lengthToDelete = end - start;
            if (lengthToDelete > 0) {
                const deletedText = pieceTable.slice(start, end);
                pieceTable.delete(start, lengthToDelete);
                lineManager.onDelete(start, lengthToDelete, deletedText);
                undoManager.push({ type: 'delete', start, length: lengthToDelete, text: deletedText });
            }
            if (text.length > 0) {
                pieceTable.insert(start, text);
                lineManager.onInsert(start, text);
                undoManager.push({ type: 'insert', start, length: text.length, text });
            }

            // Move cursor to end of mutation
            selectionHead = start + text.length;
            selectionAnchor = selectionHead;

            // Plugin Hook: afterChange
            plugins.forEach(p => p.afterChange?.(pieceTable, start, end, text));

            broadcastFrame();

            // Background: Parsing Task
            scheduler.enqueue(() => {
                if (capturedVersion === bufferVersion) {
                    // Perform heavy Tree-sitter parsing here
                    // For now, just simulate
                    console.log(`Parsing version ${capturedVersion}...`);
                    astVersion = capturedVersion;
                    currentAst = { version: capturedVersion, type: 'mock' };
                } else {
                    console.log(`Dropping stale AST for version ${capturedVersion}`);
                }
            }, 'background');
        }, 'input');
    },

    'BUFFER/UNDO': () => {
        const record = undoManager.popUndo();
        if (record) {
            // Apply inverse
            if (record.type === 'insert') {
                pieceTable.delete(record.start, record.length);
                lineManager.onDelete(record.start, record.length, record.text);
            } else {
                pieceTable.insert(record.start, record.text);
                lineManager.onInsert(record.start, record.text);
            }
            bufferVersion++;
            broadcastFrame();
        }
    }
};

function broadcastFrame() {
    scheduler.enqueue(() => {
        // v1 simple frame: send all lines
        const startLine = 0;
        const endLine = lineManager.lineOffsets.length;

        const lines = [];
        for (let i = startLine; i < endLine; i++) {
            const start = lineManager.lineOffsets[i];
            const end = i + 1 < lineManager.lineOffsets.length ? lineManager.lineOffsets[i+1] : pieceTable.length;
            let rawContent = pieceTable.slice(start, end);

            // Plugin Hook: renderLine
            plugins.forEach(p => {
                if (p.renderLine) {
                    rawContent = p.renderLine(i, rawContent);
                }
            });

            const htmlContent = tokenize(rawContent);

            lines.push({
                index: i,
                version: lineManager.lineVersions[i],
                content: htmlContent
            });
        }

        const cursorLine = lineManager.getLineIndex(selectionHead);
        const cursorCol = selectionHead - lineManager.lineOffsets[cursorLine];

        const selStart = Math.min(selectionAnchor, selectionHead);
        const selEnd = Math.max(selectionAnchor, selectionHead);

        const linesWithSelection = lines.map(line => {
            const lineStart = lineManager.lineOffsets[line.index];
            const lineEnd = line.index + 1 < lineManager.lineOffsets.length ? lineManager.lineOffsets[line.index + 1] : pieceTable.length;

            // Calculate relative selection in this line
            const relSelStart = Math.max(0, Math.min(selStart - lineStart, lineEnd - lineStart));
            const relSelEnd = Math.max(0, Math.min(selEnd - lineStart, lineEnd - lineStart));

            return {
                ...line,
                selection: relSelStart < relSelEnd ? { start: relSelStart, end: relSelEnd } : null
            };
        });

        self.postMessage({
            type: 'UI/FLUSH_FRAME',
            payload: {
                bufferVersion,
                startLine,
                endLine,
                lines: linesWithSelection,
                cursor: {
                    line: cursorLine,
                    column: cursorCol
                }
            }
        });
    }, 'render');
}

self.onmessage = (e) => {
    const { type, payload } = e.data;
    const handler = handlers[type];
    if (handler) {
        handler(payload);
    }
};
