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

const aiSuggestionBar = document.getElementById('ai-suggestion-bar');
const aiStatus = document.getElementById('ai-status');

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
    const { workspace, focusedId, diagnostics, terminal, traces, isPreview, aiSuggestion, isAiGenerating } = e.detail;

    // 1. Ribbon Rendering
    renderRibbon(workspace, focusedId);

    // 2. Diagnostics
    renderDiagnostics(diagnostics);

    // 3. Terminal (Passive Sync)
    renderTerminal(terminal);

    // 4. Traces
    renderTraces(traces);

    if (isPreview) {
        notificationBanner.innerText = "PREVIEW MODE (Time Travel)";
        notificationBanner.classList.remove('hidden');
    } else {
        notificationBanner.classList.add('hidden');
    }

    // 5. AI Preview Sync
    renderAiPreview(aiSuggestion, isAiGenerating, focusedId);
});

function renderAiPreview(suggestion, isGenerating, focusedId) {
    if (suggestion || isGenerating) {
        aiSuggestionBar.classList.remove('hidden');
        aiStatus.innerText = isGenerating ? "GhostWriter is thinking..." : "GhostWriter suggestion ready.";

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
    fatalBanner.innerText = e.detail;
    fatalBanner.classList.remove('hidden');
});

window.addEventListener('shell-notify', (e) => {
    showNotification(e.detail);
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

    // Camera movement (Geometry Invariant)
    const focusedIndex = workspace.findIndex(w => w.id === focusedId);
    if (focusedIndex !== -1) {
        // Niri style: simple horizontal ribbon
        const offset = focusedIndex * 400; // Fixed width columns (400px)
        ribbon.style.transform = `translateX(-${offset}px)`;
    }
}

function renderDiagnostics(diagnostics) {
    diagnosticsContent.innerHTML = Object.entries(diagnostics)
        .map(([k, v]) => `<div class="diag-item"><strong>${k}</strong>: ${v.length} issues</div>`)
        .join('');
}

let lastTerminalSnapshot = "";
function renderTerminal(terminal) {
    const fullText = terminal.map(c => c.text || '').join('');
    if (fullText !== lastTerminalSnapshot) {
        term.clear();
        term.write(fullText);
        lastTerminalSnapshot = fullText;
    }
}

function renderTraces(traces) {
    traceContent.innerHTML = '';

    // Build causality map
    const childrenMap = new Map(); // parentId -> child[]
    const rootTraces = [];

    traces.forEach(t => {
        if (t.parentTraceId === null) {
            rootTraces.push(t);
        } else {
            if (!childrenMap.has(t.parentTraceId)) childrenMap.set(t.parentTraceId, []);
            childrenMap.get(t.parentTraceId).push(t);
        }
    });

    const renderNode = (trace, depth = 0) => {
        const div = document.createElement('div');
        div.className = 'trace-item';
        div.style.marginLeft = `${depth * 15}px`;
        div.innerHTML = `
            <span class="trace-id">#${trace.id}</span>
            <span class="trace-mb">MB:${trace.metaBufferId}</span>
            <span class="trace-scope">[${trace.scope.join(',')}]</span>
        `;
        div.onclick = () => window.timeTravel(trace.id);
        traceContent.appendChild(div);

        const children = childrenMap.get(trace.id) || [];
        children.forEach(c => renderNode(c, depth + 1));
    };

    rootTraces.forEach(r => renderNode(r));
}

window.timeTravel = (id) => shell.timeTravel(id);

// --- INPUT HANDLERS ---

btnAnalyze.onclick = () => shell.handleEvent(1, { pending_command: { type: 'ACTIVATE_BUFFER', bufferId: 3 } });
btnAnalyzePy.onclick = () => shell.triggerExternalAnalysis('python');
btnAnalyzeJava.onclick = () => shell.triggerExternalAnalysis('java');
btnRun.onclick = () => shell.handleEvent(1, { pending_command: { type: 'ACTIVATE_RUN' } });
btnKill.onclick = () => shell.handleEvent(1, { pending_command: { type: 'KILL_RUN' } });
btnAi.onclick = () => shell.requestAISuggestion();
btnAiAccept.onclick = () => shell.commitAISuggestion();
btnAiReject.onclick = () => shell.rejectAISuggestion();
btnSave.onclick = () => shell.handleEvent(1, { type: 'COMMAND', action: 'SAVE' }); // Triggers structural sync

window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey)) {
        if (e.key === 'ArrowRight') {
             shell.handleEvent(1, { pending_command: { type: 'FOCUS_NEXT' } });
        } else if (e.key === 'ArrowLeft') {
             shell.handleEvent(1, { pending_command: { type: 'FOCUS_PREV' } });
        } else if (e.key === 'n') {
            e.preventDefault();
            shell.handleEvent(1, { pending_command: { type: 'CREATE_BUFFER', kind: 'editor' } });
        }
    }
});

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
