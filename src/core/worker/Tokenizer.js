// @ts-check

const RULES = [
    { type: 'keyword', regex: /\b(const|let|var|function|return|if|else|for|while|class|import|export|from|await|async|try|catch|new|this|throw|break|continue)\b/y },
    { type: 'string', regex: /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/y },
    { type: 'comment', regex: /(\/\/.*|\/\*[\s\S]*?\*\/)/y },
    { type: 'number', regex: /\b(\d+)\b/y },
    { type: 'operator', regex: /(=|\+|-|\*|\/|%|<|>|!|&|\||\^|~|\?|:)/y },
];

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

/**
 * @param {string} lineContent
 * @returns {string}
 */
export function tokenize(lineContent) {
    // If content already contains semantic tags, we need to preserve them
    if (lineContent.includes('<span')) {
        return lineContent;
    }
    let result = '';
    let offset = 0;

    while (offset < lineContent.length) {
        let match = null;
        let bestRule = null;

        for (const rule of RULES) {
            rule.regex.lastIndex = offset;
            const m = rule.regex.exec(lineContent);
            if (m && m.index === offset) {
                if (!match || m[0].length > match[0].length) {
                    match = m;
                    bestRule = rule;
                }
            }
        }

        if (match && bestRule) {
            result += `<span class="t-${bestRule.type}">${escapeHtml(match[0])}</span>`;
            offset += match[0].length;
        } else {
            result += escapeHtml(lineContent[offset]);
            offset++;
        }
    }

    return result;
}
