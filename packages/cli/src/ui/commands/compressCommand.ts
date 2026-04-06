/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { HistoryItemCompression } from '../types.js';
import { MessageType } from '../types.js';
import type { SlashCommand } from './types.js';
import { CommandKind } from './types.js';
import { t } from '../../i18n/index.js';

export const compressCommand: SlashCommand = {
  name: 'compress',
  altNames: ['summarize'],
  get description() {
    return t('Compresses the context by replacing it with a summary.');
  },
  kind: CommandKind.BUILT_IN,
  blocksInput: false,
  action: async (context) => {
    const { ui } = context;
    const executionMode = context.executionMode ?? 'interactive';
    const abortSignal = context.abortSignal;

    if (executionMode === 'interactive' && ui.pendingItem) {
      ui.addItem(
        {
          type: MessageType.ERROR,
          text: t('Already compressing, wait for previous request to complete'),
        },
        Date.now(),
      );
      return;
    }

    const pendingMessage: HistoryItemCompression = {
      type: MessageType.COMPRESSION,
      compression: {
        isPending: true,
        originalTokenCount: null,
        newTokenCount: null,
        compressionStatus: null,
      },
    };

    const config = context.services.config;
    const geminiClient = config?.getGeminiClient();
    if (!config || !geminiClient) {
      return {
        type: 'message',
        messageType: 'error',
        content: t('Config not loaded.'),
      };
    }

    const doCompress = async (signal?: AbortSignal) => {
      const promptId = `compress-${Date.now()}`;
      return await geminiClient.tryCompressChat(promptId, true, signal);
    };

    if (executionMode === 'acp') {
      const messages = async function* () {
        try {
          yield {
            messageType: 'info' as const,
            content: 'Compressing context...',
          };
          const compressed = await doCompress();
          if (!compressed) {
            yield {
              messageType: 'error' as const,
              content: t('Failed to compress chat history.'),
            };
            return;
          }
          yield {
            messageType: 'info' as const,
            content: `Context compressed (${compressed.originalTokenCount} -> ${compressed.newTokenCount}).`,
          };
        } catch (e) {
          yield {
            messageType: 'error' as const,
            content: t('Failed to compress chat history: {{error}}', {
              error: e instanceof Error ? e.message : String(e),
            }),
          };
        }
      };

      return { type: 'stream_messages', messages: messages() };
    }

    try {
      if (executionMode === 'interactive') {
        ui.setPendingItem(pendingMessage);
      }

      // For interactive mode, fire-and-forget so the user can keep typing.
      // The async function handles all UI updates (result/error) and cleanup.
      if (executionMode === 'interactive') {
        const signal = abortSignal;
        (async () => {
          try {
            const compressed = await doCompress(signal);
            if (!compressed) {
              ui.addItem(
                {
                  type: MessageType.ERROR,
                  text: t('Failed to compress chat history.'),
                },
                Date.now(),
              );
              return;
            }
            ui.addItem(
              {
                type: MessageType.COMPRESSION,
                compression: {
                  isPending: false,
                  originalTokenCount: compressed.originalTokenCount,
                  newTokenCount: compressed.newTokenCount,
                  compressionStatus: compressed.compressionStatus,
                },
              } as HistoryItemCompression,
              Date.now(),
            );
          } catch (e) {
            ui.addItem(
              {
                type: MessageType.ERROR,
                text: t('Failed to compress chat history: {{error}}', {
                  error: e instanceof Error ? e.message : String(e),
                }),
              },
              Date.now(),
            );
          } finally {
            ui.setPendingItem(null);
          }
        })();
        return;
      }

      const compressed = await doCompress();

      if (abortSignal?.aborted) {
        return;
      }

      if (!compressed) {
        return {
          type: 'message',
          messageType: 'error',
          content: t('Failed to compress chat history.'),
        };
      }

      return {
        type: 'message',
        messageType: 'info',
        content: `Context compressed (${compressed.originalTokenCount} -> ${compressed.newTokenCount}).`,
      };
    } catch (e) {
      // If cancelled via ESC, don't show error — cancelSlashCommand already handled UI
      if (abortSignal?.aborted) {
        return;
      }
      if (executionMode === 'interactive') {
        // Should not happen for fire-and-forget path, but handle defensively
        return;
      }

      return {
        type: 'message',
        messageType: 'error',
        content: t('Failed to compress chat history: {{error}}', {
          error: e instanceof Error ? e.message : String(e),
        }),
      };
    } finally {
      // For interactive fire-and-forget, cleanup happens in the async closure.
      // For non-interactive modes, clear pending item here.
      if (executionMode !== 'interactive') {
        ui.setPendingItem(null);
      }
    }
  },
};
