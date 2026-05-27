// @ts-check

export class LineManager {
    /**
     * @param {string} initialContent
     */
    constructor(initialContent = '') {
        /** @type {number[]} */
        this.lineOffsets = [0];
        /** @type {number[]} */
        this.lineVersions = [0];

        if (initialContent.length > 0) {
            this._fullScan(initialContent);
        }
    }

    /**
     * @param {string} text
     */
    _fullScan(text) {
        this.lineOffsets = [0];
        this.lineVersions = [0];
        let offset = 0;
        while ((offset = text.indexOf('\n', offset)) !== -1) {
            offset++; // Line starts after the newline
            this.lineOffsets.push(offset);
            this.lineVersions.push(0);
        }
    }

    /**
     * @param {number} offset
     * @returns {number} The line index (0-based)
     */
    getLineIndex(offset) {
        let low = 0;
        let high = this.lineOffsets.length - 1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            if (this.lineOffsets[mid] === offset) return mid;
            if (this.lineOffsets[mid] < offset) low = mid + 1;
            else high = mid - 1;
        }
        return high; // high will be the index of the largest offset <= target offset
    }

    /**
     * @param {number} offset
     * @param {string} insertedText
     * @param {string} fullTextAfterInsert - Required for v1 simple adaptation if we don't want to re-scan everything
     */
    onInsert(offset, insertedText) {
        const lineIndex = this.getLineIndex(offset);
        const length = insertedText.length;

        // 1. Shift all subsequent line offsets
        for (let i = lineIndex + 1; i < this.lineOffsets.length; i++) {
            this.lineOffsets[i] += length;
        }

        // 2. Scan inserted text for newlines
        const newLines = [];
        let relOffset = 0;
        while ((relOffset = insertedText.indexOf('\n', relOffset)) !== -1) {
            relOffset++;
            newLines.push(offset + relOffset);
        }

        if (newLines.length > 0) {
            this.lineOffsets.splice(lineIndex + 1, 0, ...newLines);
            this.lineVersions.splice(lineIndex + 1, 0, ...new Array(newLines.length).fill(0));
        }

        // Increment version of the line where insertion happened
        this.lineVersions[lineIndex]++;
    }

    /**
     * @param {number} offset
     * @param {number} length
     * @param {string} deletedText
     */
    onDelete(offset, length, deletedText) {
        const lineIndex = this.getLineIndex(offset);
        const endOffset = offset + length;

        // 1. Find lines that were entirely within the deleted range or started within it
        let firstLineToRemove = -1;
        let lastLineToRemove = -1;

        for (let i = 0; i < this.lineOffsets.length; i++) {
            const lineOff = this.lineOffsets[i];
            if (lineOff > offset && lineOff <= endOffset) {
                if (firstLineToRemove === -1) firstLineToRemove = i;
                lastLineToRemove = i;
            }
        }

        if (firstLineToRemove !== -1) {
            const count = lastLineToRemove - firstLineToRemove + 1;
            this.lineOffsets.splice(firstLineToRemove, count);
            this.lineVersions.splice(firstLineToRemove, count);
        }

        // 2. Shift all subsequent line offsets
        for (let i = lineIndex + 1; i < this.lineOffsets.length; i++) {
            this.lineOffsets[i] -= length;
        }

        // Increment version of the line where deletion started
        this.lineVersions[lineIndex]++;
    }
}
