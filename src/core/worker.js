// @ts-check
import { PieceTable } from './storage/PieceTable.js';
import { LineManager } from './storage/LineManager.js';
import { UndoManager } from './storage/UndoManager.js';
import { Scheduler } from './worker/Scheduler.js';

// --- Worker State ---
let pieceTable = new PieceTable('');
let lineManager = new LineManager('');
let undoManager = new UndoManager();
const scheduler = new Scheduler();

let bufferVersion = 0;
let plugins = [];

// --- API ---

const handlers = {
    'PLUGIN/REGISTER': ({ code }) => {
        // In a real system, we'd use a sandboxed evaluator or import()
        // For v1, we simulate plugin registration
        try {
            const plugin = eval(code);
            plugins.push(plugin);
        } catch (e) {
            console.error('Failed to register plugin', e);
        }
    },

    'BUFFER/INIT': ({ content }) => {
        pieceTable = new PieceTable(content);
        lineManager = new LineManager(content);
        undoManager = new UndoManager();
        bufferVersion = 0;
        broadcastFrame();
    },

    'BUFFER/MUTATE': ({ start = 0, end = 0, text = '', version }) => {
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

            bufferVersion++;

            // Plugin Hook: afterChange
            plugins.forEach(p => p.afterChange?.(pieceTable, start, end, text));

            broadcastFrame();
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
            let content = pieceTable.slice(start, end);

            // Plugin Hook: renderLine
            plugins.forEach(p => {
                if (p.renderLine) {
                    content = p.renderLine(i, content);
                }
            });

            lines.push({
                index: i,
                version: lineManager.lineVersions[i],
                content: content
            });
        }

        self.postMessage({
            type: 'UI/FLUSH_FRAME',
            payload: {
                bufferVersion,
                startLine,
                endLine,
                lines
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
