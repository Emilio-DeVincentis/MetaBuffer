// @ts-check

/** @typedef {'original' | 'add'} PieceSource */

class Node {
    /**
     * @param {PieceSource} source
     * @param {number} start
     * @param {number} length
     */
    constructor(source, start, length) {
        this.source = source;
        this.start = start;
        this.length = length;
        this.leftSubtreeLength = 0;
        this.totalLength = length;
        this.color = Node.RED;
        this.left = null;
        this.right = null;
        this.parent = null;
    }

    static RED = 0;
    static BLACK = 1;
}

export class PieceTable {
    /**
     * @param {string} originalContent
     */
    constructor(originalContent) {
        this.originalBuffer = originalContent;
        this.addBuffer = '';
        this.root = null;
        this.markers = new Map();

        if (originalContent.length > 0) {
            this.root = new Node('original', 0, originalContent.length);
            this.root.color = Node.BLACK;
            this._updateMetadata(this.root);
        }
    }

    get length() {
        return this.root ? this.root.totalLength : 0;
    }

    get pieces() {
        const result = [];
        this._inOrder(this.root, (node) => {
            result.push({ source: node.source, start: node.start, length: node.length });
        });
        return result;
    }

    _inOrder(node, callback) {
        if (!node) return;
        this._inOrder(node.left, callback);
        callback(node);
        this._inOrder(node.right, callback);
    }


    insert(offset, text) {
        if (text.length === 0) return;

        const markerOffsets = new Map();
        for (const id of this.markers.keys()) {
            markerOffsets.set(id, this.getMarkerOffset(id));
        }

        const addStart = this.addBuffer.length;
        this.addBuffer += text;
        const newNode = new Node('add', addStart, text.length);

        if (!this.root) {
            this.root = newNode;
            this.root.color = Node.BLACK;
        } else {
            const { node, offsetInPiece } = this._resolveOffset(offset);
            if (offsetInPiece === 0) {
                this._insertBefore(node, newNode);
            } else if (offsetInPiece === node.length) {
                this._insertAfter(node, newNode);
            } else {
                const leftPiece = new Node(node.source, node.start, offsetInPiece);
                const rightPiece = new Node(node.source, node.start + offsetInPiece, node.length - offsetInPiece);
                this._replaceNode(node, leftPiece);
                this._insertAfter(leftPiece, newNode);
                this._insertAfter(newNode, rightPiece);
            }
        }

        this._updateMarkersAfterInsert(offset, text.length, markerOffsets);
    }

    _resolveOffset(offset) {
        let curr = this.root;
        let remaining = offset;
        while (curr) {
            if (remaining < curr.leftSubtreeLength) {
                curr = curr.left;
            } else if (remaining < curr.leftSubtreeLength + curr.length) {
                return { node: curr, offsetInPiece: remaining - curr.leftSubtreeLength };
            } else {
                remaining -= (curr.leftSubtreeLength + curr.length);
                curr = curr.right;
            }
        }
        const rm = this._rightmost(this.root);
        return { node: rm, offsetInPiece: rm ? rm.length : 0 };
    }

    _rightmost(node) {
        if (!node) return null;
        while (node.right) node = node.right;
        return node;
    }

    _updateMetadata(node) {
        while (node) {
            node.leftSubtreeLength = node.left ? node.left.totalLength : 0;
            node.totalLength = node.leftSubtreeLength + node.length + (node.right ? node.right.totalLength : 0);
            node = node.parent;
        }
    }

    _insertBefore(target, newNode) {
        if (!target.left) {
            target.left = newNode;
            newNode.parent = target;
        } else {
            let curr = target.left;
            while (curr.right) curr = curr.right;
            curr.right = newNode;
            newNode.parent = curr;
        }
        this._updateMetadata(newNode);
        this._fixInsert(newNode);
    }

    _insertAfter(target, newNode) {
        if (!target.right) {
            target.right = newNode;
            newNode.parent = target;
        } else {
            let curr = target.right;
            while (curr.left) curr = curr.left;
            curr.left = newNode;
            newNode.parent = curr;
        }
        this._updateMetadata(newNode);
        this._fixInsert(newNode);
    }

    _replaceNode(oldNode, newNode) {
        newNode.parent = oldNode.parent;
        newNode.left = oldNode.left;
        if (newNode.left) newNode.left.parent = newNode;
        newNode.right = oldNode.right;
        if (newNode.right) newNode.right.parent = newNode;
        newNode.color = oldNode.color;

        if (!oldNode.parent) this.root = newNode;
        else if (oldNode.parent.left === oldNode) oldNode.parent.left = newNode;
        else oldNode.parent.right = newNode;

        this._updateMetadata(newNode);
    }

    // --- Red-Black Rotations & Fixing ---

    _rotateLeft(x) {
        const y = x.right;
        x.right = y.left;
        if (y.left) y.left.parent = x;
        y.parent = x.parent;
        if (!x.parent) this.root = y;
        else if (x === x.parent.left) x.parent.left = y;
        else x.parent.right = y;
        y.left = x;
        x.parent = y;
        this._updateMetadata(x);
        this._updateMetadata(y);
    }

    _rotateRight(x) {
        const y = x.left;
        x.left = y.right;
        if (y.right) y.right.parent = x;
        y.parent = x.parent;
        if (!x.parent) this.root = y;
        else if (x === x.parent.right) x.parent.right = y;
        else x.parent.left = y;
        y.right = x;
        x.parent = y;
        this._updateMetadata(x);
        this._updateMetadata(y);
    }

    _fixInsert(z) {
        while (z.parent && z.parent.color === Node.RED) {
            if (z.parent === z.parent.parent.left) {
                const y = z.parent.parent.right;
                if (y && y.color === Node.RED) {
                    z.parent.color = Node.BLACK;
                    y.color = Node.BLACK;
                    z.parent.parent.color = Node.RED;
                    z = z.parent.parent;
                } else {
                    if (z === z.parent.right) {
                        z = z.parent;
                        this._rotateLeft(z);
                    }
                    z.parent.color = Node.BLACK;
                    z.parent.parent.color = Node.RED;
                    this._rotateRight(z.parent.parent);
                }
            } else {
                const y = z.parent.parent.left;
                if (y && y.color === Node.RED) {
                    z.parent.color = Node.BLACK;
                    y.color = Node.BLACK;
                    z.parent.parent.color = Node.RED;
                    z = z.parent.parent;
                } else {
                    if (z === z.parent.left) {
                        z = z.parent;
                        this._rotateRight(z);
                    }
                    z.parent.color = Node.BLACK;
                    z.parent.parent.color = Node.RED;
                    this._rotateLeft(z.parent.parent);
                }
            }
        }
        this.root.color = Node.BLACK;
    }

    slice(start, end) {
        let result = '';
        let remaining = end - start;
        if (remaining <= 0 || !this.root) return '';
        let { node, offsetInPiece } = this._resolveOffset(start);
        while (remaining > 0 && node) {
            const take = Math.min(remaining, node.length - offsetInPiece);
            const buffer = node.source === 'original' ? this.originalBuffer : this.addBuffer;
            result += buffer.substring(node.start + offsetInPiece, node.start + offsetInPiece + take);
            remaining -= take;
            node = this._successor(node);
            offsetInPiece = 0;
        }
        return result;
    }

    _successor(node) {
        if (node.right) {
            node = node.right;
            while (node.left) node = node.left;
            return node;
        }
        let p = node.parent;
        while (p && node === p.right) {
            node = p;
            p = p.parent;
        }
        return p;
    }

    delete(start, length) {
        if (length <= 0 || !this.root) return;
        const markerOffsets = new Map();
        for (const id of this.markers.keys()) markerOffsets.set(id, this.getMarkerOffset(id));

        const end = start + length;
        const { node: startNode, offsetInPiece: startOffset } = this._resolveOffset(start);
        const { node: endNode, offsetInPiece: endOffset } = this._resolveOffset(end);

        if (startNode === endNode) {
            const leftLen = startOffset;
            const rightLen = startNode.length - endOffset;
            if (leftLen === 0 && rightLen === 0) this._removeNode(startNode);
            else if (leftLen === 0) { startNode.start += endOffset; startNode.length = rightLen; }
            else if (rightLen === 0) { startNode.length = leftLen; }
            else {
                const rightPiece = new Node(startNode.source, startNode.start + endOffset, rightLen);
                startNode.length = leftLen;
                this._insertAfter(startNode, rightPiece);
            }
        } else {
            let curr = this._successor(startNode);
            while (curr && curr !== endNode) {
                let next = this._successor(curr);
                this._removeNode(curr);
                curr = next;
            }
            if (startOffset === 0) this._removeNode(startNode);
            else startNode.length = startOffset;
            if (endOffset === endNode.length) this._removeNode(endNode);
            else { endNode.start += endOffset; endNode.length -= endOffset; }
        }

        if (this.root) this._updateMetadata(this.root);
        this._updateMarkersAfterDelete(start, length, markerOffsets);
    }

    _removeNode(node) {
        // Red-Black delete is complex. Using functional rebuild for multi-node removal in V1.
        // For single node removal, we'll use a simpler tree replacement.
        let y = node;
        let yOriginalColor = y.color;
        let x;
        if (!node.left) {
            x = node.right;
            this._transplant(node, node.right);
        } else if (!node.right) {
            x = node.left;
            this._transplant(node, node.left);
        } else {
            y = this._minimum(node.right);
            yOriginalColor = y.color;
            x = y.right;
            if (y.parent === node) {
                if (x) x.parent = y;
            } else {
                this._transplant(y, y.right);
                y.right = node.right;
                y.right.parent = y;
            }
            this._transplant(node, y);
            y.left = node.left;
            y.left.parent = y;
            y.color = node.color;
        }
        if (x) this._updateMetadata(x);
        else if (y.parent) this._updateMetadata(y.parent);
        else if (this.root) this._updateMetadata(this.root);

        if (yOriginalColor === Node.BLACK && x) {
            this._fixDelete(x);
        }
    }

    _fixDelete(x) {
        while (x !== this.root && x.color === Node.BLACK) {
            if (x === x.parent.left) {
                let w = x.parent.right;
                if (w.color === Node.RED) {
                    w.color = Node.BLACK;
                    x.parent.color = Node.RED;
                    this._rotateLeft(x.parent);
                    w = x.parent.right;
                }
                if (w.left.color === Node.BLACK && w.right.color === Node.BLACK) {
                    w.color = Node.RED;
                    x = x.parent;
                } else {
                    if (w.right.color === Node.BLACK) {
                        w.left.color = Node.BLACK;
                        w.color = Node.RED;
                        this._rotateRight(w);
                        w = x.parent.right;
                    }
                    w.color = x.parent.color;
                    x.parent.color = Node.BLACK;
                    w.right.color = Node.BLACK;
                    this._rotateLeft(x.parent);
                    x = this.root;
                }
            } else {
                let w = x.parent.left;
                if (w.color === Node.RED) {
                    w.color = Node.BLACK;
                    x.parent.color = Node.RED;
                    this._rotateRight(x.parent);
                    w = x.parent.left;
                }
                if (w.right.color === Node.BLACK && w.left.color === Node.BLACK) {
                    w.color = Node.RED;
                    x = x.parent;
                } else {
                    if (w.left.color === Node.BLACK) {
                        w.right.color = Node.BLACK;
                        w.color = Node.RED;
                        this._rotateLeft(w);
                        w = x.parent.left;
                    }
                    w.color = x.parent.color;
                    x.parent.color = Node.BLACK;
                    w.left.color = Node.BLACK;
                    this._rotateRight(x.parent);
                    x = this.root;
                }
            }
        }
        x.color = Node.BLACK;
    }

    _transplant(u, v) {
        if (!u.parent) this.root = v;
        else if (u === u.parent.left) u.parent.left = v;
        else u.parent.right = v;
        if (v) v.parent = u.parent;
    }

    _minimum(node) {
        while (node.left) node = node.left;
        return node;
    }

    hydrate(state) {
        this.originalBuffer = state.originalBuffer || '';
        this.addBuffer = state.addBuffer || '';
        this.root = null;
        if (state.pieces) {
            state.pieces.forEach(p => {
                const newNode = new Node(p.source, p.start, p.length);
                if (!this.root) {
                    this.root = newNode;
                    this.root.color = Node.BLACK;
                } else {
                    this._insertAfter(this._rightmost(this.root), newNode);
                }
            });
        }
    }

    setMarker(id, offset, affinity = 'forward') { this.markers.set(id, { offset, affinity }); }
    getMarkerOffset(id) { const m = this.markers.get(id); return m ? m.offset : null; }
    _updateMarkersAfterInsert(io, len, old) { for (const [id, m] of this.markers) { const o = old.get(id); if (o === undefined) continue; let n = o; if (o > io || (o === io && m.affinity === 'forward')) n += len; m.offset = n; } }
    _updateMarkersAfterDelete(doff, len, old) { const de = doff + len; for (const [id, m] of this.markers) { const o = old.get(id); if (o === undefined) continue; let n = o; if (o >= de) n -= len; else if (o > doff) n = doff; m.offset = n; } }
}
