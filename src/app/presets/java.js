// @ts-check

/**
 * External Java Analyzer (Phase 7 Plugin)
 * Runs outside the core kernel.
 */
export const javaAnalyzer = {
    id: 102,
    name: 'java-analyzer',
    /**
     * @param {string} code
     */
    analyze: (code) => {
        const diagnostics = [];
        if (code.includes('class ') && !code.includes('public class')) {
            diagnostics.push('Top-level class should usually be public.');
        }
        if (code.includes('System.out.print') && !code.endsWith(';')) {
            diagnostics.push('Missing semicolon after statement.');
        }
        return diagnostics;
    }
};
