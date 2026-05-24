// @ts-check

/**
 * External Java Analyzer (Phase 7 Plugin)
 * Runs outside the core kernel.
 */
export const javaAnalyzer = {
    id: 102,
    name: 'Java-LSP-Minimal',
    /**
     * @param {string} code
     * @returns {string[]}
     */
    analyze: (code) => {
        const diagnostics = [];
        const lines = code.split('\n');

        let braceCount = 0;
        let inClass = false;

        lines.forEach((line, index) => {
            const trimmed = line.trim();
            if (trimmed.length === 0) return;

            // 1. Class/Method syntax check
            if (trimmed.includes('class ')) {
                inClass = true;
                if (!trimmed.includes('public') && !trimmed.includes('private') && !trimmed.includes('protected')) {
                    // Note: package-private is valid but often discouraged for top-level in teaching
                }
                if (!trimmed.endsWith('{') && !lines[index + 1]?.trim().startsWith('{')) {
                    diagnostics.push(`Line ${index + 1}: Class definition should be followed by an opening brace.`);
                }
            }

            if (trimmed.includes('void ') || trimmed.includes('int ') || trimmed.includes('String ')) {
                if (trimmed.includes('(') && !trimmed.endsWith(';') && !trimmed.endsWith('{') && !lines[index + 1]?.trim().startsWith('{')) {
                    diagnostics.push(`Line ${index + 1}: Method definition or statement seems incomplete.`);
                }
            }

            // 2. Missing semicolon check
            if (trimmed.length > 0 &&
                !trimmed.endsWith('{') &&
                !trimmed.endsWith('}') &&
                !trimmed.endsWith(';') &&
                !trimmed.startsWith('/') &&
                !trimmed.startsWith('*') &&
                !trimmed.startsWith('@')) {

                // Exclude class/method headers
                if (!trimmed.includes('class ') && !trimmed.includes('public ') && !trimmed.includes('static ')) {
                    diagnostics.push(`Line ${index + 1}: Potential missing semicolon.`);
                }
            }

            // Brace tracking
            if (trimmed.includes('{')) braceCount++;
            if (trimmed.includes('}')) braceCount--;
        });

        if (braceCount !== 0) {
            diagnostics.push('File has unbalanced braces.');
        }

        return diagnostics;
    }
};
