// @ts-check

/**
 * @typedef {Object} UndoLogRecord
 * @property {'insert' | 'delete'} type
 * @property {number} start
 * @property {number} length
 * @property {string} text
 */

export class UndoManager {
    constructor() {
        /** @type {UndoLogRecord[]} */
        this.undoStack = [];
        /** @type {UndoLogRecord[]} */
        this.redoStack = [];
    }

    /**
     * @param {UndoLogRecord} record
     */
    push(record) {
        this.undoStack.push(record);
        this.redoStack = []; // Clear redo stack on new action
    }

    /**
     * @returns {UndoLogRecord | null}
     */
    popUndo() {
        const record = this.undoStack.pop();
        if (record) {
            this.redoStack.push(record);
        }
        return record || null;
    }

    /**
     * @returns {UndoLogRecord | null}
     */
    popRedo() {
        const record = this.redoStack.pop();
        if (record) {
            this.undoStack.push(record);
        }
        return record || null;
    }
}
