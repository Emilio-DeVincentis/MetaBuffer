# MetaBuffer System (Core Specifications)

Un ambiente editoriale riflessivo, a meta-kernel puro e buffer-centrico. Elimina le astrazioni di alto livello (App, Estensioni, Finestre) a favore di un'unica primitiva ontologica operante per via transizionale.

---

## 1. Ontologia Unica

### 1.1 Il MetaBuffer
Il `MetaBuffer` è l'**unica entità primitiva** del sistema. Ruoli percepiti come *Kernel, Editor, Terminale, LSP, Tree-sitter* o *Plugin* sono esclusivamente convenzioni operative o proiezioni di un MetaBuffer.

*   **Definizione:** Funzione di transizione di stato parziale ed entità identificabile nel tempo.
*   **Identità:** Possiede ID univoco (`id`), riferimento genealogico (`parentId`) e dichiarazione di risorse accessibili (`scope`). Non esistono istanze anonime.
*   **Formalizzazione:**
    $$\text{MetaBuffer} : \text{ContextView} \to (\Delta\text{Context}, \text{Trace} \mid \text{null})$$

### 1.2 Il Trace
Il `Trace` è la **memoria strutturata del controllo**.
*   **Esclusioni:** NON è un log di eventi UI, NON è un undo log del testo.
*   **Inclusioni:** Registra esclusivamente i cambi strutturali di controllo.
    *   **Cambi di Focus:** Spostamento dell'attenzione tra MetaBuffer.
    *   **Ciclo di Vita dei Buffer:** Creazione, attivazione o distruzione di MetaBuffer.
    *   **Passaggio di Controllo ad Agenti/Esecutori:** Quando un'entità esterna assume il controllo del flusso (es. `ACTIVATE_AGENT`, `ACTIVATE_RUN`).
    *   **Riflessione di Sistema:** Transizioni tra `Default World` e `Broken Illusion`.
    *   **Consolidamento Esterno:** Quando un risultato esterno viene commesso formalmente nel contesto (es. `COMMIT_SUGGESTION`).
*   **Proprietà:** Append-only e Stack-like. La dimensione in memoria è $O(\text{profondità del controllo})$, indipendente dal tempo o dal numero di modifiche al testo.
*   **Politica di Crescita:** In questa implementazione, lo stack dei Trace è illimitato per garantire la ricostruibilità totale. Sistemi di produzione possono implementare politiche di "Trace Pruning" o "Snapshot Consolidation" per limitare la crescita orizzontale.

### 1.3 Snapshot e Ricostruzione
Il sistema supporta la ricostruzione deterministica dello stato tramite snapshot periodici.
*   **Snapshot:** Ogni $N$ Trace strutturali (default: 50), il Kernel cattura uno snapshot immutabile del contesto.
*   **Ricostruzione:** Lo stato a qualsiasi ID di Trace può essere ricostruito applicando i delta dei Trace successivi allo snapshot più vicino.
*   **Time-Travel:** Il sistema permette il rollback atomico a qualsiasi punto della storia del controllo.

---

#### Il termine meta‑kernel indica una proprietà emergente del sistema, non un'entità separata.

## 2. Invarianti Architetturali (Fisica del Sistema)

1.  **Monismo Ontologico:** Ogni feature deve essere espressa tramite la combinazione: `MetaBuffer + Trace + Convenzione`.
2.  **Tracciabilità del Controllo:** Ogni mutazione o transizione del controllo di sistema deve emettere un `Trace`.
3.  **Separazione Logica/Device:** I motori di I/O (CodeMirror 6 per il testo, xterm per il terminale) sono *dispositivi di proiezione impuri* esterni al modello logico puro del Kernel.
4.  **Isolamento dello Scope:** Un MetaBuffer accede esclusivamente alle fette di contesto esplicitamente dichiarate nel suo array `scope`.

---

## 3. Illusioni UX (Verità Differita)

Il sistema adotta il principio del **Default World**: la complessità riflessiva e ricorsiva è sempre attiva, ma esposta solo su richiesta esplicita.

*   **Default World:** All'avvio il sistema esegue un MetaBuffer radice che emula un editor tradizionale. L'utente percepisce un unico spazio di lavoro e un singolo Command Loop globale (`M-x`). L'editing del testo locale muta il contesto ma restituisce `trace: null` per non inquinare il Trace del controllo.
*   **Rottura dell'Illusione:** L'invocazione di un comando riflessivo passa il focus a un MetaBuffer figlio. Il sistema intercetta l'input globale, registra obbligatoriamente il `Trace` ed espone lo stato strutturale dell'ambiente. Il ritorno al livello precedente è sempre garantito tramite inversione dello stack dei Trace.

---

## 4. Stack Tecnologico & Runtime
+--------------------------------------------------------+
|                  NEUTRALINOJS HOST                     |
|  - Minimal OS Bridge (File System, Process Spawn)       |
|  - Nessuna gestione del ciclo di vita applicativo       |
+---------------------------+----------------------------+| 
(IPC Bridge / Asincrono)v+--------------------------------------------------------+
|                JAVASCRIPT RUNTIME ENVIRONMENT          |
|  - Engine: QuickJS / JSC (Typed JSDoc: // @ts-check)   |
|  - Core Dispatch Loop (MetaBuffer radice): Loop di Dispatch Sincrono e Puro       |
|  - UI Projections: CodeMirror 6 + xterm.js             |
|  - Layout: Tiling lineare (niri-style) via CSS Flexbox |
+--------------------------------------------------------+

*   **Disaccoppiamento Host:** L'Host (NeutralinoJS) è un mero strato di IO intercambiabile (sostituibile con Wry/Tauri o Mock Browser). Se rimosso, il core logico deve girare immutato ovunque.

---

## 5. Mappatura dei Ruoli (Reference Architecture)


| Ruolo Percepito | Implementazione Reale | Comportamento nel Kernel |
| :--- | :--- | :--- |
| **Kernel** | `MetaBuffer` radice | Gestisce lo scope globale del sistema e il dispatching centrale. |
| **Editor** | `MetaBuffer` | Ospita la configurazione e transa i delta verso la proiezione CodeMirror 6. |
| **Terminal** | `MetaBuffer` | Interfaccia i flussi asincroni OS (spawnati da Neutralino) verso la view xterm. |
| **LSP / AST** | `MetaBuffer` figlio | Istanza di analisi agganciata al `parentId` dell'Editor; legge il testo e spinge delta diagnostici. |
| **Layout** | Proiezione | Render CSS deterministico derivato dall'albero dei MetaBuffer attivi. |

---

## 6. Struttura Dati Essenziale

```javascript
// @ts-check

/** @typedef {{ id: number, metaBufferId: number, parentTraceId: number|null, scope: string[], delta: ContextDelta|null }} Trace */

/**
 * @example Esempio di implementazione di un MetaBuffer
 *
 * export const myBuffer = {
 *   id: 10,
 *   parentId: 1,
 *   scope: ['text_key', 'status_key'],
 *   apply: (view) => {
 *     const patch = {};
 *     if (view.state.text_key === 'hello') {
 *       patch.status_key = 'ready';
 *       return {
 *         delta: { patch, signals: [{ kind: 'READY_SIGNAL' }] },
 *         trace: { metadata: { reason: 'input-match' } }
 *       };
 *     }
 *     return { delta: { patch: {} }, trace: null };
 *   }
 * };
 */

/**
 * @typedef {Object} Signal
 * @property {string} kind - Il tipo di segnale (es. 'REQUEST_ANALYSIS').
 * @property {number|null} [target] - ID del buffer di destinazione (null per broadcast).
 * @property {any} [payload] - Dati opzionali.
 */

/** @typedef {{ patch: Record<string, any>, signals?: Signal[] }} ContextDelta */
/** @typedef {{ state: Readonly<Record<string, any>> }} ContextView */

/**
 * @typedef {Object} MetaBuffer
 * @property {number} id
 * @property {number|null} parentId
 * @property {string[]} scope
 * @property {(view: ContextView) => { delta: ContextDelta, trace: Trace|null }} apply
 */
```



---

## Appendice A — Chiarimenti Operativi e Limiti del Modello

Questa sezione chiarisce alcune assunzioni operative del MetaBuffer System
per evitare interpretazioni ingenue o implementazioni non sostenibili.

Le seguenti precisazioni **non introducono nuove entità ontologiche**,
ma delimitano correttamente il dominio del modello.

---

### A.1 Sincronismo Causale vs Asincronismo Temporale

Il **dispatch del MetaBuffer è sincrono in senso causale, non temporale**.

- Il dispatch è:
  - deterministico
  - atomico
  - osservabile come singola transizione

- Il dispatch **non implica** che il lavoro sottostante sia sincrono o bloccante.

Le operazioni intrinsecamente asincrone (analisi AST, LSP, chiamate LLM,
processi esterni, I/O) **avvengono fuori dal MetaBuffer**.

Il MetaBuffer:
- non esegue il lavoro asincrono
- osserva solo il **risultato consolidato**
- riconcilia il risultato tramite un dispatch successivo

Schema corretto:
[Lavoro asincrono esterno / impuro]
↓
dispatch()
↓
(ΔContext, Trace)


Il MetaBuffer governa la **causalità del controllo**, non la temporalità
dell’esecuzione.

---

### A.2 Purezza Logica vs Purezza Computazionale

Un MetaBuffer è **logicamente puro**, non computazionalmente puro.

- `MetaBuffer.apply()` è una funzione pura rispetto al `ContextView`
- ma il `ContextView` può includere riferimenti a stati impuri esterni

Il sistema **non tenta** di rendere puro ciò che è intrinsecamente impuro
(LLM, processi OS, motori di parsing, runtime esterni).

La purezza garantita è:
- osservabilità
- tracciabilità
- riproducibilità causale

Non:
- determinismo temporale
- determinismo probabilistico

---

### A.3 Agenti e AI come MetaBuffer Riflessivi

Gli agenti (AI o rule‑based) **non sono funzioni pure** e **non sono deterministici**.

Nel MetaBuffer System:

- un agente **non incapsula** l’LLM o il motore decisionale
- un agente incapsula **la decisione di usare un risultato esterno**

Il confine è il seguente:


[LLM / Sistema esterno / impuro]
↓
MetaBuffer.apply()
↓
(ΔContext, Trace)

Un agente è **cittadino di prima classe nel controllo**, non nella computazione.

Ogni presa di controllo da parte di un agente:
- è esplicita
- è tracciata
- è revocabile

---

### A.4 ContextView come Vista, non Copia

`ContextView` **non è una copia profonda dello stato**.

Il sistema **non richiede**:
- deep copy
- deep freeze
- serializzazione completa del contesto

`ContextView` è una **vista logica**, che può:
- referenziare strutture persistenti
- usare condivisione strutturale
- delegare la gestione dei delta a dispositivi esterni (es. editor)

L’immutabilità è **semantica**, non necessariamente fisica.

Il modello non impone strutture dati specifiche
(Ropes, Piece Tables, ecc.), purché:
- il controllo resti osservabile
- lo scope resti rispettato

---

### A.5 Composizione sullo Scope (Cooperazione tra MetaBuffer)

Le chiavi di contesto **non rappresentano valori finali globali**.

Quando più MetaBuffer cooperano sullo stesso dominio (es. `suggestions`):

- ogni MetaBuffer scrive nel proprio sotto‑spazio logico
- la composizione avviene in un MetaBuffer di proiezione
- nessun MetaBuffer sovrascrive il risultato di un altro

Questo evita:
- race concettuali
- sovrascritture distruttive
- catene infinite di coordinatori ontologici

---

### A.6 Limiti Ontologici delle Proiezioni Complesse (es. Browser)

Alcuni sistemi complessi (browser, motori di layout, runtime JS isolati)
non sono rappresentabili completamente come stato MetaBuffer.

In questi casi:

- il MetaBuffer osserva una **proiezione impura**
- la fonte di verità risiede nel dispositivo esterno
- il MetaBuffer governa solo il controllo e l’integrazione

Il MetaBuffer System **non tenta** di simulare ontologicamente
motori complessi esterni.

---

### A.7 Dominio del Modello

Il MetaBuffer System è un modello per:
- controllo
- riflessione
- composizione di contesti

Non è:
- un modello di scheduling
- un framework di concorrenza
- un runtime real‑time

La sua forza è **governare il caos**, non eliminarlo.


---

## Appendice B — Scelte Operative Fondamentali

Questa sezione formalizza alcune scelte operative necessarie
per rendere il MetaBuffer System implementabile e reattivo
in un ambiente editoriale reale.

Le seguenti scelte **non introducono nuove entità ontologiche**,
ma definiscono la fisica del sistema.

---

### B.1 Immutabilità Strutturale Nativa

Il sistema adotta un modello di **immutabilità strutturale**, non di copia fisica.

- `ContextView` non è una deep copy dello stato
- è una vista logica su strutture persistenti
- le parti non modificate del contesto sono condivise (structural sharing)

Per il testo:
- si sfruttano strutture native a rope / piece table
- es. il modello transazionale di CodeMirror 6

L’immutabilità è:
- **semantica**
- **osservabile**
- non necessariamente fisica

Questo garantisce:
- O(1) / O(log N) per slicing e dispatch
- assenza di pressione sul Garbage Collector
- reattività continua durante l’editing

---

### B.2 Inversion of I/O (Runtime Reattivo)

Il MetaBuffer System non esegue operazioni asincrone.

Il runtime è modellato come un **database transizionale di controllo**:

- i MetaBuffer dichiarano stati e intenzioni
- il runtime osserva le mutazioni del contesto
- l’Host esegue le operazioni impure esternamente
- i risultati vengono riconciliati tramite dispatch successivi

Esempio (Agente AI):

1. Un MetaBuffer scrive `agent_status = 'REQUESTED'`
2. Viene emesso un Trace strutturale
3. L’Host osserva lo stato e invoca l’LLM esternamente
4. Al termine, l’Host esegue un nuovo `dispatch()` con:
   - `agent_status = 'IDLE'`
   - `suggestions.ai = [...]`

Il MetaBuffer:
- resta una funzione pura
- non attende
- non blocca
- governa solo il controllo

---

### B.3 Motore JavaScript con JIT

Per supportare carichi continui (AST, agenti, composizione),
il sistema privilegia motori JavaScript con compilazione JIT:

- JavaScriptCore 


Questa è una scelta di **performance envelope**,
non di ontologia.

---

### 🔌 LA NATURA DEL DISPOSITIVO HOST (NEUTRALINOJS)
- **Nessuna Autorità**: Neutralino non governa, non decide e non introduce nuove ontologie.
- **Ruolo di Device**: Neutralino è modellato esclusivamente come un dispositivo interno osservabile dal core (una sorgente di eventi impuri e un esecutore di effetti).
- **Interfaccia Transizionale**: Il Device reagisce in modo reattivo quando specifiche chiavi di contesto cambiano stato (es. la richiesta di una build) ed esegue il consolidamento causale invocando il `dispatch()` sincrono solo quando l'effetto esterno si è concluso.
