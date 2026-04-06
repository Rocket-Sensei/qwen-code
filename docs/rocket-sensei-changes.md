# Rocket-Sensei Session Summary

## Date

April 7, 2026

## Session Overview

This session focused on fixing the **force-send mechanics** for queued messages (double Enter to interrupt and send), improving the **compression UX** (allowing typing during `/compress`, better summaries), fixing **double ESC losing typed input**, fixing the **queued message right border** in the UI, and ensuring **queued messages are actually submitted** after interrupt (fixing a race condition with `setTimeout`).

---

## Changes Made

### 1. Feature: Force-Send Queued Messages on Double Enter (Interrupt + Send)

**Problem:** When pressing Enter during generation to force-send queued messages, the queued message was lost. Two root causes were identified:

**Root Cause A:** `cancelOngoingRequest()` was calling `onCancelSubmit()` (which copies last user message + queued messages back to the input buffer) and setting `turnCancelledRef = true` (causing subsequent `submitQuery()` to return early).

**Fix:** Added `skipOnCancelSubmit` optional parameter to `cancelOngoingRequest()` in `useGeminiStream.ts`. When `true`, it cancels the stream but skips the `onCancelSubmit` callback.

**Root Cause B:** The `setTimeout(0)` deferral used to wait for React state updates was unreliable. React's render cycle might not have processed `setIsResponding(false)` by the time the deferred `submitQuery` ran, so the `streamingState === Responding` guard still rejected it.

**Fix:** Replaced `setTimeout` with a `forceSubmitRef` flag:

- `cancelOngoingRequest(true)` sets `forceSubmitRef.current = true`
- `submitQuery` checks this flag and bypasses the `streamingState` guard when set
- `flushQueue` calls `submitQuery` directly (no `setTimeout` needed)

#### Files Changed

| File                                                 | Changes                                                                                                         |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`       | Added `forceSubmitRef`, `skipOnCancelSubmit` parameter to `cancelOngoingRequest`, guard bypass in `submitQuery` |
| `packages/cli/src/ui/hooks/useMessageQueue.ts`       | `flushQueue` calls `cancelOngoingRequest(true)` + direct `submitQuery` (no `setTimeout`)                        |
| `packages/cli/src/ui/hooks/useGeminiStream.test.tsx` | Added test for `skipOnCancelSubmit=true` behavior + force-submit test                                           |
| `packages/cli/src/ui/hooks/useMessageQueue.test.ts`  | Updated test to verify `cancelOngoingRequest` called with `true`                                                |

---

### 2. Feature: Allow Typing During Compression

**Problem:** While `/compress` was running, the user couldn't type — the input was blocked because the slash command processor set `isProcessing = true` for the entire duration of the async compression.

**Fix:** Added `blocksInput` optional flag to `SlashCommand` interface. Commands like `/compress` set `blocksInput: false` so they don't block input. The slash command processor checks this flag before setting `isProcessing`.

Additionally, `/compress` is now **fire-and-forget** in interactive mode: it sets the pending item, spawns the async compression in the background, and returns immediately. The async closure handles all UI updates (result/error/cleanup).

#### Files Changed

| File                                                   | Changes                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `packages/cli/src/ui/commands/types.ts`                | Added `blocksInput?: boolean` to `SlashCommand` interface                          |
| `packages/cli/src/ui/commands/compressCommand.ts`      | Set `blocksInput: false`, made interactive mode fire-and-forget, pass abort signal |
| `packages/cli/src/ui/hooks/slashCommandProcessor.ts`   | Check `blocksInput` before setting `isProcessing`                                  |
| `packages/cli/src/ui/commands/compressCommand.test.ts` | Updated tests for fire-and-forget async behavior                                   |

---

### 3. Feature: Better Compression Summary

**Problem:** The compression summary only showed raw token counts: `"Chat history compressed from 65477 to 30759 tokens."`

**Fix:** Improved the summary to show percentage savings and context:

```
Chat context compressed: 65477 → 30759 tokens (53% smaller).
Recent messages preserved; older conversation summarized.
```

Also added handling for the previously unhandled `COMPRESSION_FAILED_EMPTY_SUMMARY` status.

#### Files Changed

| File                                                                  | Changes                                                                |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `packages/cli/src/ui/components/messages/CompressionMessage.tsx`      | New summary text with %, added `COMPRESSION_FAILED_EMPTY_SUMMARY` case |
| `packages/cli/src/ui/hooks/useGeminiStream.ts`                        | Improved automatic compression message too                             |
| `packages/cli/src/ui/components/messages/CompressionMessage.test.tsx` | Updated tests for new text format                                      |

---

### 4. Fix: Double ESC Losing Typed Message

**Problem:** Double-pressing ESC to clear the input buffer permanently deleted the typed text — no way to recover it.

**Fix:** Before clearing the input buffer on double ESC, the text is now saved to `userMessages` history. The user can recover it with the up arrow key. This applies to:

- `InputPrompt.tsx` double ESC handler
- `AppContainer.tsx` double ESC handler
- `AppContainer.tsx` `handleExit` (Ctrl+C/Ctrl+D) input clearing

A new `onSaveInputToHistory` callback was added to the `UIActions` context and wired through `Composer` → `InputPrompt`.

#### Files Changed

| File                                                | Changes                                                                                |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `packages/cli/src/ui/contexts/UIActionsContext.tsx` | Added `onSaveInputToHistory?: () => void` to `UIActions` interface                     |
| `packages/cli/src/ui/AppContainer.tsx`              | Implemented `handleSaveInputToHistory`, wired to context + ESC handlers + `handleExit` |
| `packages/cli/src/ui/components/Composer.tsx`       | Passed `onSaveInputToHistory` to `InputPrompt`                                         |
| `packages/cli/src/ui/components/InputPrompt.tsx`    | Added `onSaveInputToHistory` prop, call it before clearing on double ESC               |

---

### 5. Fix: Queued Message Right Border

**Problem:** The queued message display only showed the left border — `borderRight={false}` was set, making the visual container look incomplete.

**Fix:** Changed `borderRight={false}` to `borderRight={true}` in `QueuedMessageDisplay.tsx`.

#### Files Changed

| File                                                      | Changes              |
| --------------------------------------------------------- | -------------------- |
| `packages/cli/src/ui/components/QueuedMessageDisplay.tsx` | `borderRight={true}` |

---

### 6. Feature: Left Arrow Hotkey to Edit Queued Message

**Problem:** When a message is queued and the user wants to edit it before sending, they had to wait for the current task to complete or flush all messages.

**Fix:** Added a `←` (left arrow) hotkey that, when the input buffer is empty and there are queued messages, pops the last queued message out of the queue and places it in the input buffer for editing. The message is immediately removed from the queue.

Implementation uses a `queueRef` ref alongside the `messageQueue` state so that `popLastQueuedMessage` can read the current queue synchronously (without waiting for React state updates).

#### Files Changed

| File                                                | Changes                                                      |
| --------------------------------------------------- | ------------------------------------------------------------ |
| `packages/cli/src/ui/hooks/useMessageQueue.ts`      | Added `queueRef`, `popLastQueuedMessage()` — ref-based queue |
| `packages/cli/src/ui/contexts/UIActionsContext.tsx` | Added `popLastQueuedMessage` to `UIActions` interface        |
| `packages/cli/src/ui/AppContainer.tsx`              | Wired `popLastQueuedMessage` through context                 |
| `packages/cli/src/ui/components/Composer.tsx`       | Passed `popLastQueuedMessage` to `InputPrompt`               |
| `packages/cli/src/ui/components/InputPrompt.tsx`    | Added left arrow handler: pops queued message into buffer    |
| `packages/cli/src/ui/hooks/useMessageQueue.test.ts` | Added tests for `popLastQueuedMessage`                       |

---

## Commit History

| Commit      | Message                                                                     |
| ----------- | --------------------------------------------------------------------------- |
| `8eb7a95dd` | fix: use forceSubmitRef to reliably submit queued message after interrupt   |
| `db238145e` | fix: improve compression UX and prevent input loss on double ESC            |
| `2bda65f40` | fix: prevent message loss when flushing queue during WaitingForConfirmation |
| `de3fc97f7` | fix: auto-submit queue when config initializes while already idle           |
| `b782973a6` | fix: remove hearing-based pun and add mystic/dark loading phrases           |
| `fe625ba3c` | feat: add queue mode toggle (all-at-once vs one-by-one)                     |

---

## Test Results

- **CLI UI tests:** 2,145 passed, 4 skipped (150 test files)
- **Core tests:** 5,283 passed, 2 skipped (206 test files)
- **Total:** 7,428 passed, 6 skipped (356 test files)
- **TypeScript:** Clean (no errors)
- **Lint:** Clean

---

## Keyboard Shortcuts

| Shortcut  | Condition                                             | Action                                                      |
| --------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| `Ctrl+Q`  | Has queued messages                                   | Toggle between `all` and `1×1` queue mode                   |
| `Enter`   | Empty buffer + has queued messages + model responding | Cancel current response + flush all queued messages         |
| `Enter`   | Empty buffer + has queued messages + model idle       | Flush all queued messages                                   |
| `↑` / `↓` | Input focused                                         | Navigate input history (including text saved by double ESC) |

---

## Remaining Open Issues

1. **`QueuedMessageDisplay.tsx` — "more" footer text** not truncated (edge case for very large queues)
2. **`InputPrompt.tsx` — `queueMode` prop** prefixed with `_queueMode` to satisfy ESLint unused-var rule
3. **`QueuedMessageDisplay.tsx` — `onToggleMode` prop** prefixed with `_onToggleMode` to satisfy ESLint
4. **No visual feedback after flush** — user doesn't see a confirmation that queued messages were sent (the "Request cancelled." message appears from `cancelOngoingRequest`, but no "Queued messages submitted" confirmation)
5. **`getQueuedMessagesText`** may be unused dead code
6. **"Tool 'bash' not found in registry"** — LLM hallucinates tool name `"bash"` instead of `"run_shell_command"`. This is a model-side issue; the registered name is `"run_shell_command"` per `ToolNames.SHELL`.
