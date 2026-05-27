// @ts-check
import { describe, it, expect } from 'vitest';
import { PieceTable } from '../src/core/storage/PieceTable.js';
import { LineManager } from '../src/core/storage/LineManager.js';

describe('Performance Stress Tests', () => {
    it('should handle large file loading (50MB)', () => {
        const size = 50 * 1024 * 1024;
        const largeText = 'a'.repeat(size);
        const start = performance.now();
        const pt = new PieceTable(largeText);
        const end = performance.now();

        console.log(`Loading 50MB file took: ${(end - start).toFixed(2)}ms`);
        expect(pt.length).toBe(size);
        expect(end - start).toBeLessThan(200); // 200ms target
    });

    it('should handle 100,000+ lines with fast offset resolution', () => {
        const lineCount = 100000;
        const text = 'line\n'.repeat(lineCount);
        const pt = new PieceTable(text);
        const lm = new LineManager(text);

        const start = performance.now();
        // Simulate random insertions
        for (let i = 0; i < 100; i++) {
            const offset = Math.floor(Math.random() * pt.length);
            pt.insert(offset, 'test');
            lm.onInsert(offset, 'test');
        }
        const end = performance.now();
        const latency = (end - start) / 100;

        console.log(`Average insertion latency on 100k lines: ${latency.toFixed(4)}ms`);
        expect(latency).toBeLessThan(2); // 2ms target
    });
});
