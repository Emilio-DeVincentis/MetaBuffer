# Macro Phase 4 — Deterministic Multi-Buffer Reactions
## MetaBuffer System — Pure Reaction & Derivation Prompt

---

## ✅ CHECKLIST DI TASK OPERATIVI

### 1. Reaction Model nel Core (No New Dispatch)
- [x] Implementa il modello di reazione a passata singola in `MetaBufferRuntime.dispatch()`.
- [x] Garantisci l'atomicità: tutte le reazioni avvengono prima del commit.
- [x] Aggrega i delta di tutti i buffer (trigger + reattori) nel Trace finale.
- [x] Implementa il fail-fast in caso di conflitti di scrittura sullo stesso tasto di contesto.

### 2. Scenario di Dogfooding: Source → Transform → Output
- [x] Implementa `Buffer_Sorgente` (Editor).
- [x] Implementa `Buffer_Trasformatore` (Uppercase Transformer).
- [x] Implementa `Buffer_Output` (Display).
- [x] Verifica che un singolo `RUN` aggiorni l'intera catena con un solo Trace.

### 3. Trace Semantics & Time-Travel
- [x] Verifica che il Trace contenga il patch aggregato.
- [x] Verifica che il Time-Travel ripristini correttamente lo stato "reagito" di tutti i buffer.
- [x] Verifica la persistenza del modello di derivazione dopo l'idratazione.

### 4. UI Viewer
- [x] Assicurati che il Trace Viewer rimanga pulito (un solo Trace per comando).
- [x] Visualizza nel nastro Niri i tre buffer della pipeline.

---
## ❌ VINCOLI DI FASE
- [x] Nessun nuovo tipo di Trace.
- [x] Nessun dispatch multiplo o concatenato.
- [x] Nessun loop o multi-passata.
