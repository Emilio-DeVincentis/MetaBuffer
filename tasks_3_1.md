# Macro Phase 3 — Multi-Buffer Spatial Routing (Niri-Style Canvas)
## MetaBuffer System — Spatial Orchestration Prompt

### Premessa Architetturale e Stilistica (Non Negoziabile)
Il core del runtime e la persistenza sono sigillati. Questa fase estende la UI e i comandi del guscio impuro per implementare la gestione Multi-Buffer seguendo rigorosamente il "Niri-style" (Infinite Horizontal Scrolling Canvas). Sono tassativamente VIETATI i tab classici, le finestre sovrapposte o i menu a tendina per cambiare file. Tutto lo spazio di lavoro è un nastro orizzontale continuo.

---

## 🎯 Obiettivo della Macro Phase
Evolvere l'MVP da un editor a singolo file a un ambiente spaziale Multi-Buffer ispirato a Niri. L'utente visualizza i MetaBuffer come colonne verticali affiancate che scorrono lungo l'asse orizzontale. Il focus del sistema determina quale colonna è attiva, modificando la proiezione corrente e la telecamera visiva.

---

## ✅ CHECKLIST DI TASK OPERATIVI (IN ORDINE SEQUENZIALE)

### 1. Grafo dei Buffer e Focus Spaziale nel Core
- [x] Estendi l'utilizzo del `MetaBufferRuntime` per ospitare molteplici istanze di MetaBuffer attive nel contesto.
- [x] Implementa il comando puro di controllo `FOCUS_BUFFER(bufferId)`. Questo comando aggiorna nel contesto l'ID del buffer spazialmente attivo.
- [x] **Verifica dei Trace**: Lo spostamento del focus da un buffer all'altro emette un Trace strutturale. La digitazione del testo all'interno della colonna focalizzata NON emette Trace.

### 2. UI Niri-Style: Il Nastro Orizzontale Infinito
- [x] Ridisegna il layout CSS/HTML dell'MVP: l'area di lavoro principale deve essere un container con `display: flex; flex-direction: row; overflow-x: hidden;` (il nastro di Niri).
- [x] Ogni MetaBuffer registrato viene renderizzato come una colonna verticale fissa (es. `width: 80vw; flex-shrink: 0;`).
- [x] L'integrazione di CodeMirror si estende per avere un'istanza (o una vista agganciata) per ogni singola colonna del nastro.

### 3. Animazione e Routing del Focus
- [x] Quando il kernel elabora un comando `FOCUS_BUFFER`, la UI deve reagire muovendo l'intero nastro orizzontale (tramite CSS `transform: translateX(...)`) per centrare visivamente la colonna del buffer focalizzato.
- [x] Implementa scorciatoie da tastiera native o pulsanti di navigazione orizzontale (es. `Cmd/Ctrl + Freccia Destra/Sinistra`) che inviano al kernel i rispettivi comandi di cambio focus.

### 4. Cross-Projection Spaziale (L'Inspector Laterale)
- [x] Implementa un MetaBuffer L’Inspector Spaziale è un MetaBuffer standard, senza privilegi, con scope multi‑buffer esplicitamente dichiarato e accesso in sola lettura. di tipo "Inspector Spaziale" posizionato come colonna finale del nastro o come overlay fisso.
- [x] Questo modulo legge in modalità sola lettura lo stato di tutti gli altri buffer presenti sul nastro e proietta una vista aggregata (statistiche globali, relazioni tra i file o log di sistema).

### 5. Trace‑Driven State Reconstruction (Temporal + Spatial) (La Prova del Nove)
- [x] Verifica il funzionamento del Time-Travel in combinazione con il layout Niri.
- [x] Cliccando su un vecchio Trace nel Viewer, il sistema deve ripristinare lo stato dei testi del passato e contemporaneamente spostare la telecamera (scroll orizzontale) sulla colonna esatta che era focalizzata nell'istante in cui quel Trace è stato generato.
- [x] Il cold start (idratazione) deve ripristinare la corretta posizione della telecamera e del focus sul nastro.
#### Il sistema NON esegue replay dei comandi. Ricostruisce uno snapshot coerente associato a un Trace.

---

## ❌ COSE ASSOLUTAMENTE VIETATE IN QUESTA MACROFASE
- [ ] ❌ Usare librerie esterne o framework (es. framer-motion, GSAP) per gestire lo scroll orizzontale o il layout. Usa solo CSS moderno e proprietà native.
- [ ] ❌ Permettere lo scroll manuale del mouse che disallinea la telefonia visiva rispetto al focus registrato nel kernel. La posizione orizzontale della UI deve essere una proiezione deterministica dello stato del focus.

---

## ✅ Criteri di Accettazione e Successo
- I buffer sono disposti orizzontalmente come fogli affiancati (Niri-style).
- Il passaggio tra i buffer sposta fluidamente il nastro centrando la risorsa attiva.
- Il Time-Travel riavvolge il tempo e lo "spazio", spostando la telecamera del nastro nel passato.
