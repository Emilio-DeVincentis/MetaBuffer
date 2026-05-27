// @ts-check

/**
 * @typedef {'original' | 'add'} PieceSource
 */

/**
 * @typedef {Object} Piece
 * @property {PieceSource} source
 * @property {number} start - Offset in the source buffer
 * @property {number} length - Length of the piece
 */

/**
 * @typedef {Object} Marker
 * @property {number} pieceIndex
 * @property {number} localOffset
 * @property {'forward' | 'backward'} affinity
 */

export class PieceTable {
    /**
     * @param {string} originalContent
     */
    constructor(originalContent) {
        this.originalBuffer = originalContent;
        this.addBuffer = '';
        /** @type {Piece[]} */
        this.pieces = originalContent.length > 0
            ? [{ source: 'original', start: 0, length: originalContent.length }]
            : [];

        /** @type {Map<string, Marker>} */
        this.markers = new Map();

        this._length = originalContent.length;
    }

    get length() {
        return this._length;
    }

    /**
     * @param {number} offset
     * @param {string} text
     */
    insert(offset, text) {
        if (text.length === 0) return;

        // Capture marker offsets before mutation
        const markerOffsets = new Map();
        for (const id of this.markers.keys()) {
            markerOffsets.set(id, this.getMarkerOffset(id));
        }

        const addStart = this.addBuffer.length;
        this.addBuffer += text;
        const newPiece = { source: /** @type {PieceSource} */ ('add'), start: addStart, length: text.length };

        if (this.pieces.length === 0) {
            this.pieces.push(newPiece);
        } else {
            const { index, offsetInPiece } = this._resolveOffset(offset);

            if (offsetInPiece === 0) {
                // Insert before the piece
                this.pieces.splice(index, 0, newPiece);
            } else if (offsetInPiece === this.pieces[index].length) {
                // Insert after the piece
                // Optimization: check if we can append to the current piece if it's also from addBuffer and contiguous
                const currPiece = this.pieces[index];
                if (currPiece.source === 'add' && currPiece.start + currPiece.length === addStart) {
                    currPiece.length += text.length;
                } else {
                    this.pieces.splice(index + 1, 0, newPiece);
                }
            } else {
                // Split the piece
                const currPiece = this.pieces[index];
                const leftPiece = { source: currPiece.source, start: currPiece.start, length: offsetInPiece };
                const rightPiece = { source: currPiece.source, start: currPiece.start + offsetInPiece, length: currPiece.length - offsetInPiece };

                this.pieces.splice(index, 1, leftPiece, newPiece, rightPiece);
            }
        }

        this._length += text.length;
        this._updateMarkersAfterInsert(offset, text.length, markerOffsets);
    }

    /**
     * @param {number} start
     * @param {number} length
     */
    delete(start, length) {
        if (length <= 0) return;
        const end = start + length;

        // Capture marker offsets before mutation
        const markerOffsets = new Map();
        for (const id of this.markers.keys()) {
            markerOffsets.set(id, this.getMarkerOffset(id));
        }

        const startRes = this._resolveOffset(start);
        const endRes = this._resolveOffset(end);

        if (startRes.index === endRes.index) {
            // Delete within a single piece
            const piece = this.pieces[startRes.index];
            const leftLen = startRes.offsetInPiece;
            const rightLen = piece.length - endRes.offsetInPiece;

            if (leftLen === 0 && rightLen === 0) {
                this.pieces.splice(startRes.index, 1);
            } else if (leftLen === 0) {
                piece.start += endRes.offsetInPiece;
                piece.length -= endRes.offsetInPiece;
            } else if (rightLen === 0) {
                piece.length = leftLen;
            } else {
                const rightPiece = { source: piece.source, start: piece.start + endRes.offsetInPiece, length: rightLen };
                piece.length = leftLen;
                this.pieces.splice(startRes.index + 1, 0, rightPiece);
            }
        } else {
            // Delete across multiple pieces
            const startPiece = this.pieces[startRes.index];
            const endPiece = this.pieces[endRes.index];

            const piecesToRemove = endRes.index - startRes.index - 1;

            // Handle end piece first to not invalidate start index
            if (endRes.offsetInPiece === endPiece.length) {
                // Remove entire end piece
                this.pieces.splice(endRes.index, 1);
            } else {
                endPiece.start += endRes.offsetInPiece;
                endPiece.length -= endRes.offsetInPiece;
            }

            if (piecesToRemove > 0) {
                this.pieces.splice(startRes.index + 1, piecesToRemove);
            }

            if (startRes.offsetInPiece === 0) {
                this.pieces.splice(startRes.index, 1);
            } else {
                startPiece.length = startRes.offsetInPiece;
            }
        }

        this._length -= length;
        this._updateMarkersAfterDelete(start, length, markerOffsets);
    }

    /**
     * @param {number} start
     * @param {number} end
     * @returns {string}
     */
    slice(start, end) {
        let result = '';
        let remaining = end - start;
        if (remaining <= 0) return '';

        const { index, offsetInPiece } = this._resolveOffset(start);
        let currIndex = index;
        let currOffset = offsetInPiece;

        while (remaining > 0 && currIndex < this.pieces.length) {
            const piece = this.pieces[currIndex];
            const take = Math.min(remaining, piece.length - currOffset);
            const buffer = piece.source === 'original' ? this.originalBuffer : this.addBuffer;
            result += buffer.substring(piece.start + currOffset, piece.start + currOffset + take);

            remaining -= take;
            currIndex++;
            currOffset = 0;
        }

        return result;
    }

    /**
     * @param {number} offset
     * @returns {{ index: number, offsetInPiece: number }}
     */
    _resolveOffset(offset) {
        if (offset < 0) offset = 0;
        if (offset > this._length) offset = this._length;

        let accumulated = 0;
        for (let i = 0; i < this.pieces.length; i++) {
            const piece = this.pieces[i];
            if (offset <= accumulated + piece.length) {
                return { index: i, offsetInPiece: offset - accumulated };
            }
            accumulated += piece.length;
        }

        return { index: this.pieces.length - 1, offsetInPiece: this.pieces.length > 0 ? this.pieces[this.pieces.length - 1].length : 0 };
    }

    /**
     * @param {number} offset
     * @returns {PieceIterator}
     */
    createIterator(offset) {
        return new PieceIterator(this, offset);
    }

    // --- Marker Support ---

    /**
     * @param {string} id
     * @param {number} offset
     * @param {'forward' | 'backward'} affinity
     */
    setMarker(id, offset, affinity = 'forward') {
        const { index, offsetInPiece } = this._resolveOffset(offset);
        this.markers.set(id, { pieceIndex: index, localOffset: offsetInPiece, affinity });
    }

    /**
     * @param {string} id
     * @returns {number | null}
     */
    getMarkerOffset(id) {
        const marker = this.markers.get(id);
        if (!marker) return null;

        let accumulated = 0;
        for (let i = 0; i < marker.pieceIndex; i++) {
            accumulated += this.pieces[i].length;
        }
        return accumulated + marker.localOffset;
    }

    /**
     * @param {number} insertOffset
     * @param {number} length
     * @param {Map<string, number>} oldOffsets
     */
    _updateMarkersAfterInsert(insertOffset, length, oldOffsets) {
        for (const [id, marker] of this.markers) {
            const oldOffset = oldOffsets.get(id);
            if (oldOffset === undefined) continue;

            let newOffset = oldOffset;
            if (oldOffset > insertOffset || (oldOffset === insertOffset && marker.affinity === 'forward')) {
                newOffset += length;
            }

            const { index, offsetInPiece } = this._resolveOffset(newOffset);
            marker.pieceIndex = index;
            marker.localOffset = offsetInPiece;
        }
    }

    /**
     * @param {number} deleteOffset
     * @param {number} length
     * @param {Map<string, number>} oldOffsets
     */
    _updateMarkersAfterDelete(deleteOffset, length, oldOffsets) {
        const deleteEnd = deleteOffset + length;
        for (const [id, marker] of this.markers) {
            const oldOffset = oldOffsets.get(id);
            if (oldOffset === undefined) continue;

            let newOffset = oldOffset;
            if (oldOffset >= deleteEnd) {
                newOffset -= length;
            } else if (oldOffset > deleteOffset) {
                // Clamping
                newOffset = deleteOffset;
            }

            const { index, offsetInPiece } = this._resolveOffset(newOffset);
            marker.pieceIndex = index;
            marker.localOffset = offsetInPiece;
        }
    }
}

export class PieceIterator {
    /**
     * @param {PieceTable} table
     * @param {number} offset
     */
    constructor(table, offset) {
        this.table = table;
        this.offset = offset;
        const { index, offsetInPiece } = table._resolveOffset(offset);
        this.pieceIndex = index;
        this.offsetInPiece = offsetInPiece;
    }

    next() {
        if (this.offset >= this.table.length) return null;

        const piece = this.table.pieces[this.pieceIndex];
        const buffer = piece.source === 'original' ? this.table.originalBuffer : this.table.addBuffer;
        const char = buffer[piece.start + this.offsetInPiece];

        this.offset++;
        this.offsetInPiece++;

        if (this.offsetInPiece >= piece.length && this.offset < this.table.length) {
            this.pieceIndex++;
            this.offsetInPiece = 0;
        }

        return char;
    }

    prev() {
        if (this.offset <= 0) return null;

        this.offset--;
        if (this.offsetInPiece > 0) {
            this.offsetInPiece--;
        } else {
            this.pieceIndex--;
            this.offsetInPiece = this.table.pieces[this.pieceIndex].length - 1;
        }

        const piece = this.table.pieces[this.pieceIndex];
        const buffer = piece.source === 'original' ? this.table.originalBuffer : this.table.addBuffer;
        return buffer[piece.start + this.offsetInPiece];
    }
}
