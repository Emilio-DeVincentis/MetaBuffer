import * as Runtime from '../src/core/MetaBufferRuntime.js';
import { createShell } from '../src/app/Shell.js';
import { rootBuffer } from '../src/buffers/root.js';
import { editorBuffer } from '../src/buffers/editor.js';
import { jsAnalyzerBuffer } from '../src/buffers/jsAnalyzer.js';
import { agentBuffer } from '../src/buffers/agent.js';
import { executorBuffer } from '../src/buffers/executor.js';
import { spatialInspectorBuffer } from '../src/buffers/inspector.js';
import { transformerBuffer } from '../src/buffers/transformer.js';
import { outputBuffer } from '../src/buffers/output.js';

// --- EXTERNAL LIBS (ESM CDN) ---
import { EditorView, basicSetup, Decoration, WidgetType } from "https://esm.sh/@codemirror/view";
import { javascript } from "https://esm.sh/@codemirror/lang-javascript";
import { EditorState, StateField, StateEffect } from "https://esm.sh/@codemirror/state";
import { oneDark } from "https://esm.sh/@codemirror/theme-one-dark";
import { Terminal } from "https://esm.sh/xterm";

// Setup Core
let kernelState = Runtime.createInitialState();
kernelState = Runtime.registerBuffer(kernelState, rootBuffer);
kernelState = Runtime.registerBuffer(kernelState, editorBuffer);
kernelState = Runtime.registerBuffer(kernelState, jsAnalyzerBuffer);
kernelState = Runtime.registerBuffer(kernelState, agentBuffer);
kernelState = Runtime.registerBuffer(kernelState, executorBuffer);
kernelState = Runtime.registerBuffer(kernelState, spatialInspectorBuffer);
kernelState = Runtime.registerBuffer(kernelState, transformerBuffer);
kernelState = Runtime.registerBuffer(kernelState, outputBuffer);

const shell = createShell(kernelState);

// UI Elements
const ribbon = document.getElementById('niri-ribbon');
const diagnosticsContent = document.getElementById('diagnostics-content');
const traceContent = document.getElementById('trace-content');
const notificationBanner = document.getElementById('notification-banner');
const fatalBanner = document.getElementById('fatal-banner');

const btnAnalyze = document.getElementById('btn-analyze');
const btnAnalyzePy = document.getElementById('btn-analyze-py');
const btnAnalyzeJava = document.getElementById('btn-analyze-java');
const btnRun = document.getElementById('btn-run');
const btnKill = document.getElementById('btn-kill');
const btnAi = document.getElementById('btn-ai');
const btnAiAccept = document.getElementById('btn-ai-accept');
const btnAiReject = document.getElementById('btn-ai-reject');
const btnSave = document.getElementById('btn-save');
const btnThemeToggle = document.getElementById('btn-theme-toggle');
const btnExportTraces = document.getElementById('btn-export-traces');

const aiSuggestionBar = document.getElementById('ai-suggestion-bar');
const aiStatus = document.getElementById('ai-status');
const aiSpinner = document.getElementById('ai-spinner');
const analysisSpinner = document.getElementById('analysis-spinner');
const runSpinner = document.getElementById('run-spinner');

const helpModal = document.getElementById('help-modal');
const btnCloseHelp = document.getElementById('btn-close-help');

// --- USER-FRIENDLY ERROR MAPPING ---
const errorMap = {
    'BUFFER_NOT_FOUND': 'Requested buffer could not be located.',
    'WRITE_CONFLICT': 'System conflict: multiple components tried to update the same data simultaneously.',
    'BOOTSTRAP_FAILURE': 'Critical failure during system initialization.',
    'DISPATCH_FAILURE': 'The requested action could not be processed safely.',
    'RECONSTRUCTION_FAILURE': 'Time-travel failed: could not restore previous system state.',
    'TRACE_NOT_FOUND': 'The requested point in time no longer exists in history.',
    'ERR_CORE_BOOTSTRAP_MISSING': 'Invalid session file: boot record missing.',
    'ERR_CORE_HYDRATION_FAILURE': 'Could not load session: data may be corrupted.'
};

// --- CODEMIRROR AI EXTENSION ---
class GhostWidget extends WidgetType {
    constructor(text) { super(); this.text = text; }
    toDOM() {
        let span = document.createElement("span");
        span.className = "cm-ai-ghost";
        span.textContent = this.text;
        return span;
    }
}

const setAiGhost = StateEffect.define();
const aiGhostField = StateField.define({
    create() { return Decoration.none },
    update(ghosts, tr) {
        ghosts = ghosts.map(tr.changes);
        for (let e of tr.effects) if (e.is(setAiGhost)) {
            ghosts = e.value ? Decoration.set([Decoration.widget({
                widget: new GhostWidget(e.value),
                side: 1
            }).range(tr.state.doc.length)]) : Decoration.none;
        }
        return ghosts;
    },
    provide: f => EditorView.decorations.from(f)
});

/** @type {Map<number, EditorView>} */
const editors = new Map(); // bufferId -> EditorView

// --- TERMINAL SETUP (xterm.js) ---
const term = new Terminal({
    theme: {
        background: '#1e1e1e'
    },
    convertEol: true,
    cursorBlink: true,
    disableStdin: true // Passive view only
});
term.open(document.getElementById('output-terminal'));

// --- SHELL EVENT LISTENERS ---

window.addEventListener('shell-render', (e) => {
    const { workspace, focusedId, diagnostics, inspector, terminal, runStatus, traces, isPreview, aiSuggestion, isAiGenerating } = e.detail;

    // 1. Ribbon Rendering
    renderRibbon(workspace, focusedId);

    // 2. Diagnostics & Inspector
    renderDiagnostics(diagnostics, inspector);

    // 3. Terminal (Passive Sync)
    renderTerminal(terminal, runStatus);

    // 4. Traces
    renderTraces(traces);

    if (isPreview) {
        notificationBanner.innerText = "PREVIEW MODE (Time Travel)";
        notificationBanner.classList.remove('hidden');
    } else {
        notificationBanner.classList.add('hidden');
    }

    // 5. AI Preview Sync & Loading Indicators
    renderAiPreview(aiSuggestion, isAiGenerating, focusedId);

    // Check loading states from trace/context implicitly or via flags
    // (Analysis spinner is handled via explicit triggers for simplicity in MVP)
});

function renderAiPreview(suggestion, isGenerating, focusedId) {
    if (suggestion || isGenerating) {
        aiSuggestionBar.classList.remove('hidden');
        aiStatus.innerText = isGenerating ? "GhostWriter is thinking..." : "GhostWriter suggestion ready.";
        aiSpinner.classList.toggle('hidden', !isGenerating);

        const view = editors.get(focusedId);
        if (view && suggestion) {
            view.dispatch({ effects: setAiGhost.of(suggestion.text) });
        }
    } else {
        aiSuggestionBar.classList.add('hidden');
        editors.forEach(view => view.dispatch({ effects: setAiGhost.of(null) }));
    }
}

window.addEventListener('shell-error', (e) => {
    const friendlyMsg = errorMap[e.detail] || e.detail;
    fatalBanner.innerText = friendlyMsg;
    fatalBanner.classList.remove('hidden');
});

window.addEventListener('shell-notify', (e) => {
    const friendlyMsg = errorMap[e.detail] || e.detail;
    showNotification(friendlyMsg);
});

// --- RENDERERS ---

function renderRibbon(workspace, focusedId) {
    // Sync columns
    for (const [id, view] of editors) {
        if (!workspace.find(w => w.id === id)) {
            document.getElementById(`col-${id}`)?.remove();
            view.destroy();
            editors.delete(id);
        }
    }

    workspace.forEach((ws) => {
        let col = document.getElementById(`col-${ws.id}`);
        if (!col) {
            col = document.createElement('div');
            col.id = `col-${ws.id}`;
            col.className = 'column';
            col.innerHTML = `
                <div class="column-header">Buffer ${ws.id} [${ws.kind}]</div>
                <div class="column-content" id="content-${ws.id}"></div>
            `;
            ribbon.appendChild(col);

            if (ws.kind === 'editor') {
                const view = new EditorView({
                    state: EditorState.create({
                        doc: ws.content || '',
                        extensions: [
                            basicSetup,
                            javascript(),
                            oneDark,
                            aiGhostField,
                            EditorView.updateListener.of((update) => {
                                if (update.docChanged) {
                                    shell.updateEphemeralBuffer(ws.id, update.state.doc.toString());
                                }
                            })
                        ]
                    }),
                    parent: document.getElementById(`content-${ws.id}`)
                });
                editors.set(ws.id, view);
            }
        }

        col.classList.toggle('active', ws.id === focusedId);

        if (ws.kind === 'editor') {
            const view = editors.get(ws.id);
            const currentDoc = view.state.doc.toString();
            if (currentDoc !== ws.content && !view.hasFocus) {
                view.dispatch({
                    changes: { from: 0, to: currentDoc.length, insert: ws.content || '' }
                });
            }
        } else if (ws.kind === 'inspector') {
            document.getElementById(`content-${ws.id}`).innerHTML = `<pre>${JSON.stringify(ws, null, 2)}</pre>`;
        }
    });

    // Camera movement
    const focusedIndex = workspace.findIndex(w => w.id === focusedId);
    if (focusedIndex !== -1) {
        const offset = focusedIndex * 400;
        ribbon.style.transform = `translateX(-${offset}px)`;
    }
}

function renderDiagnostics(diagnostics, inspector) {
    let html = Object.entries(diagnostics)
        .map(([k, v]) => `<div class="diag-item"><strong>${k}</strong>: ${v.length} issues</div>`)
        .join('');

    if (inspector) {
        html += `
            <div class="inspector-summary" style="margin-top: 20px; border-top: 1px solid #444; padding-top: 10px;">
                <h4>Spatial Inspector</h4>
                <div class="diag-item">Active: ${inspector.activeCount} buffers</div>
                <div class="diag-item">Total: ${inspector.totalBuffers} buffers</div>
                <div class="diag-item">Focus: #${inspector.focusedId}</div>
                <div class="diag-item">History: [${inspector.focusHistory.join(',')}]</div>
            </div>
        `;
    }

    diagnosticsContent.innerHTML = html;
}

let lastTerminalSnapshot = "";
function renderTerminal(terminal, runStatus) {
    const fullText = terminal.map(c => c.text || '').join('');
    if (fullText !== lastTerminalSnapshot) {
        term.clear();
        term.write(fullText);
        lastTerminalSnapshot = fullText;
    }

    runSpinner.classList.toggle('hidden', runStatus !== 'RUNNING' && runStatus !== 'REQUESTED');
}

function renderTraces(traces) {
    traceContent.innerHTML = '';

    const childrenMap = new Map();
    const rootTraces = [];

    traces.forEach(t => {
        if (t.parentTraceId === null) rootTraces.push(t);
        else {
            if (!childrenMap.has(t.parentTraceId)) childrenMap.set(t.parentTraceId, []);
            childrenMap.get(t.parentTraceId).push(t);
        }
    });

    const renderNode = (trace, depth = 0) => {
        const div = document.createElement('div');
        div.className = 'trace-item';
        div.style.marginLeft = `${depth * 15}px`;

        const info = document.createElement('div');
        info.className = 'trace-info';
        info.innerHTML = `
            <span class="trace-id">#${trace.id}</span>
            <span class="trace-mb">MB:${trace.metaBufferId}</span>
            <span class="trace-scope">[${trace.scope.join(',')}]</span>
        `;
        info.onclick = () => window.timeTravel(trace.id);

        const actions = document.createElement('div');
        actions.className = 'trace-actions';
        const btnCopy = document.createElement('button');
        btnCopy.innerText = 'Copy';
        btnCopy.onclick = (e) => {
            e.stopPropagation();
            navigator.clipboard.writeText(JSON.stringify(trace, null, 2));
            showNotification('Trace copied to clipboard');
        };
        actions.appendChild(btnCopy);

        div.appendChild(info);
        div.appendChild(actions);
        traceContent.appendChild(div);

        const children = childrenMap.get(trace.id) || [];
        children.forEach(c => renderNode(c, depth + 1));
    };

    rootTraces.forEach(r => renderNode(r));
}

window.timeTravel = (id) => shell.timeTravel(id);

// --- INPUT HANDLERS ---

btnAnalyze.onclick = () => {
    analysisSpinner.classList.remove('hidden');
    shell.handleEvent(1, { pending_command: { type: 'ACTIVATE_BUFFER', bufferId: 3 } })
        .finally(() => analysisSpinner.classList.add('hidden'));
};

btnAnalyzePy.onclick = () => {
    analysisSpinner.classList.remove('hidden');
    shell.triggerExternalAnalysis('python')
        .finally(() => analysisSpinner.classList.add('hidden'));
};

btnAnalyzeJava.onclick = () => {
    analysisSpinner.classList.remove('hidden');
    shell.triggerExternalAnalysis('java')
        .finally(() => analysisSpinner.classList.add('hidden'));
};

btnRun.onclick = () => {
    runSpinner.classList.remove('hidden');
    shell.handleEvent(1, { pending_command: { type: 'ACTIVATE_RUN' } });
};

btnKill.onclick = () => {
    shell.handleEvent(1, { pending_command: { type: 'KILL_RUN' } })
        .finally(() => runSpinner.classList.add('hidden'));
};

btnAi.onclick = () => shell.requestAISuggestion();
btnAiAccept.onclick = () => shell.commitAISuggestion();
btnAiReject.onclick = () => shell.rejectAISuggestion();
btnSave.onclick = () => {
    shell.handleEvent(1, { type: 'COMMAND', action: 'SAVE' });
    showNotification('System state saved successfully');
};

btnThemeToggle.onclick = () => {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    showNotification(`Switched to ${next} mode`);
};

btnExportTraces.onclick = () => {
    const traces = kernelState.traceStack;
    const blob = new Blob([JSON.stringify(traces, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metabuffer-traces-${new Date().toISOString()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('History exported as JSON');
};

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey)) {
        if (e.key === 'ArrowRight') {
             shell.handleEvent(1, { pending_command: { type: 'FOCUS_NEXT' } });
        } else if (e.key === 'ArrowLeft') {
             shell.handleEvent(1, { pending_command: { type: 'FOCUS_PREV' } });
        } else if (e.key === 'n') {
            e.preventDefault();
            shell.handleEvent(1, { pending_command: { type: 'CREATE_BUFFER', kind: 'editor' } });
        } else if (e.key === 's') {
            e.preventDefault();
            btnSave.click();
        } else if (e.key === '?' || e.key === '/') {
            e.preventDefault();
            helpModal.classList.toggle('hidden');
        }
    }
});

btnCloseHelp.onclick = () => helpModal.classList.add('hidden');

function showNotification(msg) {
    notificationBanner.innerText = msg;
    notificationBanner.classList.remove('hidden');
    setTimeout(() => notificationBanner.classList.add('hidden'), 3000);
}

// --- BOOT ---
window.onload = async () => {
    if (typeof Neutralino !== 'undefined') {
        Neutralino.init();
    }
    await shell.boot();
};
