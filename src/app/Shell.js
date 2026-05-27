// @ts-check

/**
 * Shell handles the bridge between the Passive UI and the Worker Core.
 */
export function createShell() {
    /** @type {Worker | null} */
    let worker = null;

    // UI References
    let container = null;

    let activeAiSuggestion = null;

    const renderFrame = (frame) => {
        if (!container) return;

        // BSR: Buffer-Side Rendering
        const currentLines = Array.from(container.querySelectorAll('.view-line'));
        const lineMap = new Map();
        currentLines.forEach(el => lineMap.set(parseInt(/** @type {HTMLElement} */(el).dataset.lineIndex || '0'), el));

        frame.lines.forEach(line => {
            let lineEl = lineMap.get(line.index);
            if (!lineEl) {
                lineEl = document.createElement('div');
                lineEl.className = 'view-line';
                lineEl.dataset.lineIndex = line.index;
                container.appendChild(lineEl);
            }

            // Always update position as line index might have changed due to insertions/deletions elsewhere
            lineEl.style.position = 'absolute';
            lineEl.style.top = '0';
            lineEl.style.left = '0';
            lineEl.style.transform = `translate3d(0, ${line.index * 19}px, 0)`;

            if (lineEl.dataset.version !== String(line.version)) {
                // XSS Protection: use textContent for buffer content
                lineEl.textContent = line.content;

                // Inject AI Ghost Text if it belongs to this line
                if (activeAiSuggestion && activeAiSuggestion.lineIndex === line.index) {
                    const ghostSpan = document.createElement('span');
                    ghostSpan.className = 'ai-ghost';
                    ghostSpan.style.opacity = '0.5';
                    ghostSpan.style.fontStyle = 'italic';
                    ghostSpan.textContent = activeAiSuggestion.text;
                    lineEl.appendChild(ghostSpan);
                }

                lineEl.dataset.version = line.version;
            }
            lineMap.delete(line.index);
        });

        // Remove old lines
        lineMap.forEach(el => el.remove());
    };

    const shell = {
        boot: async () => {
            // Worker path relative to index.html in Neutralino/Serve
            worker = new Worker('../src/core/worker.js', { type: 'module' });

            worker.onmessage = (e) => {
                const { type, payload } = e.data;
                if (type === 'UI/FLUSH_FRAME') {
                    renderFrame(payload);
                } else if (type === 'AI/SUGGESTION') {
                    activeAiSuggestion = payload;
                    // Trigger a re-render or wait for next frame
                }
            };

            // Setup UI structure for the new architecture
            const ribbon = document.getElementById('niri-ribbon');
            if (ribbon) {
                ribbon.innerHTML = `
                    <div class="editor-column">
                        <div class="editor-canvas" style="position: relative; height: 100%; overflow-y: auto;">
                            <div class="emacs-gpu-lines-container" style="position: relative;"></div>
                        </div>
                    </div>
                `;
                container = ribbon.querySelector('.emacs-gpu-lines-container');
            }

            // Initialize EditContext
            if (typeof window !== 'undefined' && 'EditContext' in window) {
                const canvas = document.querySelector('.editor-canvas');
                if (canvas) {
                    // @ts-ignore
                    const editContext = new EditContext();
                    // @ts-ignore
                    canvas.editContext = editContext;

                    editContext.addEventListener('textupdate', (e) => {
                        worker.postMessage({
                            type: 'BUFFER/MUTATE',
                            payload: {
                                start: e.updateRangeStart,
                                end: e.updateRangeEnd,
                                text: e.updateText
                            }
                        });
                    });
                }
            } else {
                console.warn('EditContext not supported in this environment.');
            }

            worker.postMessage({ type: 'BUFFER/INIT', payload: { content: '// MetaBuffer PieceTree Core Initialized\n' } });
        },

        undo: () => {
            if (worker) {
                worker.postMessage({ type: 'BUFFER/UNDO' });
            }
        }
    };

    return shell;
}
