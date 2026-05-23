// @ts-check

/**
 * External Python Analyzer (Phase 7 Plugin)
 * Runs outside the core kernel.
 */
export const pythonAnalyzer = {
    id: 101,
    name: 'python-analyzer',
    /**
     * @param {string} code
     */
    analyze: (code) => {
        const diagnostics = [];
        if (code.includes('print ') && !code.includes('print(')) {
            diagnostics.push('Python 3 requires parentheses for print statements.');
        }
        if (code.includes('def ') && !code.endsWith(':') && !code.includes(':\n')) {
             // Simple check for missing colon in function def
             if (/def\s+\w+\(.*\)\s*[^:]/.test(code)) {
                 diagnostics.push('Missing colon after function definition.');
             }
        }
        return diagnostics;
    }
};
