// @ts-check

/**
 * Shell handles the bridge between the Passive UI and the Worker Core.
 */
export function createShell() {
    /** @type {Worker | null} */
    let worker = null;

    // UI References
    let container = null;
    let caret = null;

    let activeAiSuggestion = null;

    let lastHeartbeat = Date.now();

    const renderFrame = (frame) => {
        if (!container || !caret) return;

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
                // Now receiving HTML spans from worker. Worker handles escaping of raw text.
                lineEl.innerHTML = line.content;

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

        // Position standalone caret
        if (frame.cursor) {
            caret.style.transform = `translate3d(${frame.cursor.column * 8.4}px, ${frame.cursor.line * 19}px, 0)`;
        }
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
                } else if (type === 'CORE/HEARTBEAT') {
                    lastHeartbeat = Date.now();
                } else if (type === 'CORE/AUTO_SAVE') {
                    localStorage.setItem('metabuffer_autosave', JSON.stringify(payload));
                }
            };

            // Heartbeat monitor
            setInterval(() => {
                if (Date.now() - lastHeartbeat > 5000) {
                    console.error('Worker HANG detected! Restarting...');
                    shell.boot(); // Recovery
                }
            }, 2000);

            // Setup UI structure for the new architecture
            const ribbon = document.getElementById('niri-ribbon');
            if (ribbon) {
                ribbon.innerHTML = `
                    <div class="editor-column">
                        <div class="editor-canvas" style="position: relative; height: 100%; overflow-y: auto; background: var(--bg-main);">
                            <div class="emacs-gpu-lines-container" style="position: relative;"></div>
                            <div class="custom-caret" style="position: absolute; top: 0; left: 0; width: 2px; height: 19px; background: var(--accent-color); z-index: 100; transition: transform 0.05s;"></div>
                        </div>
                    </div>
                `;
                container = ribbon.querySelector('.emacs-gpu-lines-container');
                caret = ribbon.querySelector('.custom-caret');
            }

            // Initialize EditContext
            if (typeof window !== 'undefined' && 'EditContext' in window) {
                const canvas = /** @type {HTMLElement} */(document.querySelector('.editor-canvas'));
                if (canvas) {
                    // @ts-ignore
                    const editContext = new EditContext();
                    // @ts-ignore
                    canvas.editContext = editContext;

                    // Support IME and OS integration
                    const updateBounds = () => {
                        const rect = canvas.getBoundingClientRect();
                        // @ts-ignore
                        editContext.updateControlBounds(rect);
                        // @ts-ignore
                        editContext.updateSelectionBounds(rect);
                    };
                    updateBounds();
                    window.addEventListener('resize', updateBounds);

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

            const savedState = localStorage.getItem('metabuffer_autosave');
            if (savedState) {
                worker.postMessage({ type: 'CORE/HYDRATE', payload: JSON.parse(savedState) });
            } else {
                worker.postMessage({ type: 'BUFFER/INIT', payload: { content: '// MetaBuffer PieceTree Core Initialized\n' } });
            }
        },

        undo: () => {
            if (worker) {
                worker.postMessage({ type: 'BUFFER/UNDO' });
            }
        }
    };

    return shell;
}
