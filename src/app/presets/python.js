// @ts-check

/**
 * External Python Analyzer (Phase 7 Plugin)
 * Runs outside the core kernel.
 */
export const pythonAnalyzer = {
    id: 101,
    name: 'Python-LSP-Minimal',
    /**
     * @param {string} code
     * @returns {string[]}
     */
    analyze: (code) => {
        const diagnostics = [];
        const lines = code.split('\n');

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed.length === 0) return;

            // 1. Missing colon check
            if (trimmed.startsWith('def ') || trimmed.startsWith('if ') || trimmed.startsWith('for ') || trimmed.startsWith('while ') || trimmed.startsWith('class ')) {
                if (!trimmed.endsWith(':')) {
                    diagnostics.push(`Line ${index + 1}: Missing colon at the end of statement.`);
                }
            }

            // 2. Simple indentation check (must be multiple of 4 if not 0)
            const leadingSpaces = line.search(/\S/);
            if (leadingSpaces > 0 && leadingSpaces % 4 !== 0) {
                diagnostics.push(`Line ${index + 1}: Indentation should be a multiple of 4 spaces.`);
            }

            // 3. Print statement check (Python 3)
            if (trimmed.startsWith('print ') && !trimmed.startsWith('print(')) {
                diagnostics.push(`Line ${index + 1}: Python 3 requires parentheses for print().`);
            }
        });

        return diagnostics;
    }
};
