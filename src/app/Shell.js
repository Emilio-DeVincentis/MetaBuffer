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

        // Trace Viewer Update
        const traceContent = document.getElementById('trace-content');
        if (traceContent && frame.traces) {
            traceContent.innerHTML = frame.traces.map(t => `
                <div class="trace-item">
                    <span class="trace-id">#${t.id}</span>
                    <span class="trace-info">${t.type} (buf:${t.bufferId})</span>
                </div>
            `).join('');
        }

        // Diagnostics Panel Update
        const diagContent = document.getElementById('diagnostics-content');
        if (diagContent && frame.inspector) {
            diagContent.innerHTML = `
                <div>Buffers: ${frame.inspector.totalBuffers}</div>
                <div>Active: ${frame.inspector.activeCount}</div>
                <div>Traces: ${frame.inspector.traceCount}</div>
                <div>Uptime: ${(frame.inspector.workerUptime / 1000).toFixed(1)}s</div>
            `;
        }

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

            // BSR Optimization: incremental row-level updates
            const existingLines = new Set();
            buf.lines.forEach(line => {
                let lineEl = container.querySelector(`.view-line[data-line-index="${line.index}"]`);
                if (!lineEl) {
                    lineEl = document.createElement('div');
                    lineEl.className = 'view-line';
                    lineEl.dataset.lineIndex = String(line.index);
                    lineEl.style.position = 'absolute';
                    lineEl.style.top = '0';
                    lineEl.style.left = '0';
                    lineEl.style.transform = `translate3d(0, ${line.index * 19}px, 0)`;
                    container.appendChild(lineEl);
                }
                if (lineEl.dataset.version !== String(line.version)) {
                    lineEl.innerHTML = line.html;
                    lineEl.dataset.version = String(line.version);
                }
                existingLines.add(String(line.index));
            });

            // Cleanup lines outside viewport
            Array.from(container.querySelectorAll('.view-line')).forEach(el => {
                if (!existingLines.has(/** @type {HTMLElement} */(el).dataset.lineIndex)) {
                    el.remove();
                }
            });

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

            worker.onmessage = async (e) => {
                const { type, payload } = e.data;
                const NL = typeof window !== 'undefined' ? /** @type {any} */(window).Neutralino : null;

                const saveToHost = async (data) => {
                    const serialized = JSON.stringify(data, null, 2);
                    if (NL) {
                        try {
                            await NL.filesystem.writeFile('./session.tmp', serialized);
                            await NL.filesystem.move('./session.tmp', './session.json');
                        } catch (err) {
                            console.error('Auto-save failed:', err);
                        }
                    } else {
                        localStorage.setItem('metabuffer_autosave', serialized);
                    }
                };

                if (type === 'UI/FLUSH_FRAME') {
                    renderFrame(payload);
                } else if (type === 'AI/SUGGESTION') {
                    activeAiSuggestion = payload;
                } else if (type === 'CORE/HEARTBEAT') {
                    lastHeartbeat = Date.now();
                } else if (type === 'CORE/AUTO_SAVE') {
                    await saveToHost(payload);
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

            const NL = typeof window !== 'undefined' ? /** @type {any} */(window).Neutralino : null;
            let savedState = null;

            if (NL) {
                try {
                    savedState = await NL.filesystem.readFile('./session.json');
                } catch (e) {
                    // File not found, likely first boot
                }
            } else {
                savedState = localStorage.getItem('metabuffer_autosave');
            }

            if (savedState) {
                console.log('Hydrating from saved state');
                worker.postMessage({ type: 'CORE/HYDRATE', payload: JSON.parse(savedState) });
            } else {
                console.log('Starting fresh session');
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
        },

        saveState: () => {
            if (worker) {
                console.log('Shell: Requesting save...');
                worker.postMessage({ type: 'CORE/REQUEST_SAVE' });
            }
        }
    };

    return shell;
}
