// @ts-check

/**
 * @typedef {Object} TraceRecord
 * @property {number} id
 * @property {number|null} parentId
 * @property {number} bufferId
 * @property {string} type
 * @property {Object} metadata
 */

export class TraceRepository {
    constructor() {
        /** @type {TraceRecord[]} */
        this.records = [];
        this.nextId = 1;
    }

    /**
     * @param {number} bufferId
     * @param {string} type
     * @param {Object} metadata
     * @param {number|null} parentId
     */
    append(bufferId, type, metadata = {}, parentId = null) {
        const record = {
            id: this.nextId++,
            parentId,
            bufferId,
            type,
            metadata: { ...metadata, timestamp: Date.now() }
        };
        this.records.push(record);
        return record;
    }

    getHistory() {
        return [...this.records];
    }
}
