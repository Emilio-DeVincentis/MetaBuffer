// @ts-check

/**
 * Shell handles the bridge between the Passive UI and the Worker Core.
 */
export function createShell() {
    /** @type {Worker | null} */
    let worker = null;
    let activeAiSuggestion = null;
    let lastHeartbeat = Date.now();

    const renderFrame = (frame) => {
        const ribbon = document.getElementById('niri-ribbon');
        if (!ribbon) return;

        // Multi-Buffer Management
        const currentBufferEls = Array.from(ribbon.querySelectorAll('.column'));
        const bufferMap = new Map();
        currentBufferEls.forEach(el => bufferMap.set(parseInt(/** @type {HTMLElement} */(el).dataset.bufferId || '0'), el));

        frame.buffers.forEach(buf => {
            let bufEl = bufferMap.get(buf.id);
            if (!bufEl) {
                bufEl = document.createElement('div');
                bufEl.className = 'column';
                bufEl.dataset.bufferId = String(buf.id);
                bufEl.innerHTML = `
                    <div class="column-header">Buffer ${buf.id}</div>
                    <div class="column-content">
                        <div class="editor-canvas" style="position: relative; height: 100%; overflow-y: auto; background: var(--bg-main);">
                            <div class="emacs-gpu-lines-container" style="position: relative;"></div>
                            <div class="custom-caret" style="position: absolute; top: 0; left: 0; width: 2px; height: 19px; background: var(--accent-color); z-index: 100; transition: transform 0.05s; display: none;"></div>
                        </div>
                    </div>
                `;
                ribbon.appendChild(bufEl);
                setupBufferInteractions(buf.id, bufEl);
            }

            bufEl.classList.toggle('active', buf.id === frame.focusedBufferId);

            const container = /** @type {HTMLElement} */(bufEl.querySelector('.emacs-gpu-lines-container'));
            const caret = bufEl.querySelector('.custom-caret');
            if (!container || !caret) return;

            // Show/Hide caret based on focus
            /** @type {HTMLElement} */(caret).style.display = (buf.id === frame.focusedBufferId) ? 'block' : 'none';

            // BSR Optimization: if buffer version matches, only handle caret
            if (container.dataset.version !== String(buf.version)) {
                container.innerHTML = buf.htmlFrameChunk;
                container.dataset.version = String(buf.version);
            }

            // Position Caret
            if (buf.cursor) {
                /** @type {HTMLElement} */(caret).style.transform = `translate3d(${buf.cursor.column * 8.4}px, ${buf.cursor.line * 19}px, 0)`;
            }

            bufferMap.delete(buf.id);
        });

        // Remove closed buffers
        bufferMap.forEach(el => el.remove());

        // Horizontal Ribbon Scroll
        const focusedIndex = frame.buffers.findIndex(b => b.id === frame.focusedBufferId);
        if (focusedIndex !== -1) {
            ribbon.style.transform = `translateX(-${focusedIndex * 400}px)`;
        }
    };

    const setupBufferInteractions = (bufferId, bufEl) => {
        const canvas = /** @type {HTMLElement} */(bufEl.querySelector('.editor-canvas'));
        if (typeof window !== 'undefined' && 'EditContext' in window) {
            // @ts-ignore
            const editContext = new EditContext();
            // @ts-ignore
            canvas.editContext = editContext;

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
                        bufferId,
                        start: e.updateRangeStart,
                        end: e.updateRangeEnd,
                        text: e.updateText
                    }
                });
            });

            // Mouse Interaction
            let isDragging = false;
            const handleMouse = (e, select = false) => {
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top + canvas.scrollTop;
                const line = Math.floor(y / 19);
                const col = Math.round(x / 8.4);

                worker.postMessage({
                    type: 'BUFFER/MOUSE_CLICK',
                    payload: { bufferId, line, col, select }
                });
            };

            canvas.addEventListener('mousedown', (e) => {
                isDragging = true;
                handleMouse(e);
            });
            window.addEventListener('mousemove', (e) => { if (isDragging) handleMouse(e, true); });
            window.addEventListener('mouseup', () => { isDragging = false; });

            // Viewport Tracking
            const reportViewport = () => {
                worker.postMessage({
                    type: 'BUFFER/VIEWPORT_UPDATE',
                    payload: {
                        bufferId,
                        scrollTop: canvas.scrollTop,
                        viewHeight: canvas.clientHeight
                    }
                });
            };
            canvas.addEventListener('scroll', reportViewport);
            window.addEventListener('resize', reportViewport);
            reportViewport();
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

            const ribbon = document.getElementById('niri-ribbon');
            if (ribbon) ribbon.innerHTML = ''; // Clear for multi-buffer boot

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
        },

        redo: () => {
            if (worker) {
                worker.postMessage({ type: 'BUFFER/REDO' });
            }
        },

        createBuffer: (content = '') => {
            if (worker) {
                worker.postMessage({ type: 'BUFFER/CREATE', payload: { content } });
            }
        },

        focusNext: () => {
            if (worker) {
                worker.postMessage({ type: 'CORE/FOCUS_NAV', payload: { direction: 1 } });
            }
        },

        focusPrev: () => {
            if (worker) {
                worker.postMessage({ type: 'CORE/FOCUS_NAV', payload: { direction: -1 } });
            }
        }
    };

    return shell;
}
