// @ts-check

/**
 * Mock AI Agent (Phase 8 Boundary Layer Plugin)
 * Simulates non-deterministic asynchronous token generation.
 * Operates strictly outside the kernel.
 */
export const mockAIAgent = {
    id: 'ai-mock-agent-v1',
    name: 'GhostWriter-v1',

    /**
     * Simulates a completion request.
     * @param {string} prompt
     * @param {Object} options
     * @param {(token: string) => void} onToken
     * @returns {Promise<string>} Final stabilized string.
     */
    async complete(prompt, options = {}, onToken) {
        const sentences = [
            "\n// AI suggestion based on context:",
            "\nfunction optimizedHelper() {",
            "\n    return Math.sqrt(Math.PI);",
            "\n}",
            "\n// End of optimization."
        ];

        let final = "";
        for (const sentence of sentences) {
            // Simulate random network latency (100-800ms)
            const latency = Math.floor(Math.random() * 700) + 100;
            await new Promise(r => setTimeout(r, latency));

            final += sentence;
            if (onToken) onToken(sentence);
        }

        return final;
    }
};
