/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { useTerminalSize } from '../hooks/useTerminalSize.js';

const MAX_DISPLAYED_QUEUED_MESSAGES = 3;
const PADDING_LEFT = 2;

/**
 * Truncate text to fit within a given visual width, accounting for emoji widths.
 * Returns the truncated text without ellipsis.
 */
function truncateToVisualWidth(text: string, maxWidth: number): string {
  if (maxWidth <= 0) {
    return '';
  }

  const visualWidth = stringWidth(text);
  if (visualWidth <= maxWidth) {
    return text;
  }

  let result = '';
  let currentWidth = 0;

  for (const char of text) {
    const charWidth = stringWidth(char);
    if (currentWidth + charWidth > maxWidth) {
      break;
    }
    result += char;
    currentWidth += charWidth;
  }

  return result;
}

export interface QueuedMessageDisplayProps {
  messageQueue: string[];
}

const RIGHT_MARGIN = 2;

export const QueuedMessageDisplay = ({
  messageQueue,
}: QueuedMessageDisplayProps) => {
  const { columns } = useTerminalSize();
  const availableWidth = columns - PADDING_LEFT - RIGHT_MARGIN;

  if (messageQueue.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      {messageQueue
        .slice(0, MAX_DISPLAYED_QUEUED_MESSAGES)
        .map((message, index) => {
          const preview = message.replace(/\s+/g, ' ');
          const truncated = truncateToVisualWidth(preview, availableWidth);

          return (
            <Box key={index} paddingLeft={PADDING_LEFT} overflow="hidden">
              <Text dimColor>{truncated}</Text>
            </Box>
          );
        })}
      {messageQueue.length > MAX_DISPLAYED_QUEUED_MESSAGES && (
        <Box paddingLeft={PADDING_LEFT}>
          <Text dimColor>
            ... (+
            {messageQueue.length - MAX_DISPLAYED_QUEUED_MESSAGES} more)
          </Text>
        </Box>
      )}
    </Box>
  );
};
