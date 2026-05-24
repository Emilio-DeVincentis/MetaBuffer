# MetaBuffer System

Un ambiente editoriale riflessivo. Una primitiva, un protocollo, nessuna gerarchia privilegiata.

---

## 1. Il Protocollo MetaBuffer

MetaBuffer non è una classe né un'entità istanziabile: è un **protocollo**. Qualsiasi componente che rispetti il contratto seguente *è* un MetaBuffer:

$$\text{MetaBuffer} : \text{ContextView} \to (\Delta\text{Context},\ \text{Trace} \mid \mathbf{null})$$

Questo include, senza distinzione di rango: il kernel, l'editor, il terminale, un parser AST, un agente AI, un plugin scritto dall'utente. Nessun componente ha autorità strutturale maggiore di un altro — solo scope dichiarato.

Il sistema si estende **implementando il protocollo**, non ereditando da classi o registrando hook predefiniti. Non esistono punti di estensione speciali: il protocollo stesso è l'unico punto di estensione. La complessità emerge dalla composizione.

**Identità:** ogni MetaBuffer dichiara `id`, `parentId` e `scope`. Non esistono istanze anonime.

---

## 2. Il Trace

Memoria strutturata del controllo. Append-only, stack-like.

Registra esclusivamente cambi strutturali del controllo: chi assume il focus, da quale origine, con quale scope. Non è un log UI. Non è un undo log del testo.

Costo in memoria: $O(\text{profondità del controllo})$ — indipendente dal tempo o dal volume delle modifiche al testo.

---

## 3. Invarianti del Sistema

1. **Monismo:** ogni feature è `MetaBuffer + Trace + Convenzione`. Niente altro.
2. **Tracciabilità:** ogni mutazione strutturale del controllo emette un Trace.
3. **Isolamento dello scope:** un MetaBuffer legge e scrive esclusivamente le chiavi dichiarate nel proprio `scope`.
4. **Separazione logico/dispositivo:** i motori di I/O (CodeMirror 6, xterm.js) sono dispositivi di proiezione impuri, esterni al modello logico. Il core deve girare immutato senza di essi.

---

## 4. Riflessività e Stratificazione

Il sistema adotta il principio del **Default World**: la complessità riflessiva è sempre attiva, esposta solo su richiesta.

**Default World.** All'avvio il MetaBuffer radice emula un editor tradizionale. L'editing locale muta il contesto ma restituisce `trace: null` — il Trace del controllo non viene inquinato.

**Rottura dell'illusione.** Un comando riflessivo trasferisce il focus a un MetaBuffer figlio. L'input globale viene intercettato, il Trace viene emesso, lo stato strutturale viene esposto. Il ritorno è garantito dall'inversione dello stack dei Trace.

Poiché MetaBuffer è un protocollo, un utente può definire un MetaBuffer che avvolge qualsiasi altro MetaBuffer — intercettandone l'input, modificandone l'output, sostituendone il comportamento — senza toccare il codice originale e senza richiedere permessi di estensione al sistema. Questo vale anche per il dispatch loop stesso.

---

## 5. Sincronismo Causale e Asincronia

Il dispatch è **sincrono in senso causale**: deterministico, atomico, osservabile come singola transizione. Non implica che il lavoro sottostante sia sincrono.

Le operazioni asincrone (AST, LSP, LLM, I/O di sistema) avvengono **fuori** dal MetaBuffer. Il MetaBuffer osserva solo il risultato consolidato e lo riconcilia tramite un dispatch successivo:

```
[operazione asincrona / impura]
         ↓
    dispatch()
         ↓
  (ΔContext, Trace)
```

Un MetaBuffer governa la **causalità del controllo**, non la temporalità dell'esecuzione.

**Purezza.** `apply()` è logicamente pura rispetto al `ContextView`. Il `ContextView` può tuttavia referenziare stati impuri esterni: la purezza garantita è osservabilità, tracciabilità, riproducibilità causale — non determinismo probabilistico.

---

## 6. Stack Tecnologico

```
+--------------------------------------------------+
|              NEUTRALINOJS HOST                   |
|  OS Bridge (FS, Process Spawn) — solo I/O        |
+--------------------------------------------------+
              ↕  IPC Asincrono
+--------------------------------------------------+
|     JAVASCRIPT RUNTIME  (JSC / QuickJS)          |
|  // @ts-check  —  Typed JSDoc                    |
|  Core: Dispatch Loop sincrono (MetaBuffer radice)|
|  Proiezioni: CodeMirror 6 · xterm.js             |
|  Layout: tiling lineare via CSS Flexbox          |
+--------------------------------------------------+
```

Neutralino è un **dispositivo**: reagisce reattivamente ai cambi di contesto, esegue effetti, riconcilia tramite `dispatch()` al termine. Nessuna autorità, nessuna ontologia propria. È intercambiabile con qualsiasi altro host (Wry/Tauri, mock browser) senza alterare il core logico.

---

## 7. Struttura Dati

```javascript
// @ts-check

/** @typedef {{ id: number, metaBufferId: number, parentTraceId: number|null, scope: string[] }} Trace */
/** @typedef {{ patch: Record<string, any> }} ContextDelta */
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

## 8. Convenzioni Operative

I ruoli percepiti sono convenzioni, non entità distinte.

| Ruolo percepito | Implementazione | Note |
|:---|:---|:---|
| Kernel | MetaBuffer radice | scope globale, dispatch centrale |
| Editor | MetaBuffer | delta → proiezione CodeMirror 6 |
| Terminal | MetaBuffer | flussi OS → proiezione xterm |
| LSP / AST | MetaBuffer figlio | `parentId` = Editor; push delta diagnostici |
| Agente AI | MetaBuffer | osserva risultato LLM esterno, emette Trace |
| Layout | Proiezione pura | render CSS deterministico dall'albero MetaBuffer attivi |

---

## Appendice — Delimitazioni del Modello

**ContextView** è una vista logica, non una deep copy. L'immutabilità è semantica: si sfrutta structural sharing. Per il testo si delega al modello transazionale del dispositivo (es. CodeMirror 6). Costo atteso: $O(1)$ / $O(\log N)$ per slicing e dispatch.

**Composizione dello scope.** Quando più MetaBuffer cooperano sullo stesso dominio (es. `suggestions`), ognuno scrive nel proprio sotto-spazio logico. Un MetaBuffer di proiezione compone i risultati. Nessun MetaBuffer sovrascrive l'output di un altro.

**Sistemi esterni complessi** (browser, motori di layout, runtime isolati): il MetaBuffer ne osserva una proiezione impura; la fonte di verità rimane nel dispositivo esterno. Il MetaBuffer governa controllo e integrazione, non la simulazione del dispositivo.

**Dominio del modello.** Governa controllo, riflessione e composizione di contesti. Non è un framework di concorrenza, non è un runtime real-time. La sua forza è governare il caos, non eliminarlo.
