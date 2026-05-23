// @ts-check

/**
 * Mock AI Agent (Phase 8 Boundary Layer Plugin)
 * Simulates non-deterministic asynchronous token generation.
 * Operates strictly outside the kernel.
 */
export const mockAIAgent = {
    id: 'ai-mock-agent-v1',
    name: 'MockGhostWriter',

    /**
     * Simulates a completion request.
     * @param {string} prompt
     * @param {Object} options
     * @param {(token: string) => void} onToken
     * @returns {Promise<string>} Final stabilized string.
     */
    async complete(prompt, options = {}, onToken) {
        const generatedTokens = [
            "\n// AI Suggestion:\n",
            "function",
            " ",
            "add(a, b)",
            " ",
            "{\n",
            "    return",
            " ",
            "a + b;",
            "\n}"
        ];

        let final = "";
        for (const token of generatedTokens) {
            // Simulate random latency (20-100ms)
            const latency = Math.floor(Math.random() * 80) + 20;
            await new Promise(r => setTimeout(r, latency));

            final += token;
            if (onToken) onToken(token);
        }

        return final;
    }
};
