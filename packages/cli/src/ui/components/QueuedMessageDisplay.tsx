/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Box, Text } from 'ink';
import stringWidth from 'string-width';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { theme } from '../semantic-colors.js';
import { type QueueMode } from '../hooks/useMessageQueue.js';

const MAX_DISPLAYED_QUEUED_MESSAGES = 3;
const PADDING_LEFT = 2;
const RIGHT_MARGIN = 2;

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
  queueMode?: QueueMode;
  onToggleMode?: () => void;
}

export const QueuedMessageDisplay = ({
  messageQueue,
  queueMode = 'all-at-once',
  onToggleMode: _onToggleMode,
}: QueuedMessageDisplayProps) => {
  const { columns } = useTerminalSize();
  const availableWidth = columns - PADDING_LEFT - RIGHT_MARGIN;

  if (messageQueue.length === 0) {
    return null;
  }

  // Truncate the "Queued" label to fit the header row
  const queuedLabel = truncateToVisualWidth('Queued', availableWidth);
  // Mode badge: short label for the current mode
  const modeBadge = queueMode === 'one-by-one' ? '1×1' : 'all';
  // Truncate the description to fit the header row
  const description = truncateToVisualWidth(
    queueMode === 'one-by-one'
      ? 'sends one at a time when task done'
      : 'will send when task done',
    availableWidth,
  );

  return (
    <Box
      flexDirection="column"
      marginTop={1}
      borderStyle="single"
      borderTop={true}
      borderBottom={true}
      borderLeft={true}
      borderRight={true}
      borderColor={theme.status.warningDim}
    >
      {/* Header row: "Queued" label + count + mode badge + description */}
      <Box paddingLeft={PADDING_LEFT} overflow="hidden">
        <Text color={theme.status.warningDim} bold>
          {queuedLabel}
        </Text>
        <Text color={theme.text.secondary}> ({messageQueue.length}) </Text>
        <Text
          color={
            queueMode === 'one-by-one'
              ? theme.status.warningDim
              : theme.text.secondary
          }
          bold={queueMode === 'one-by-one'}
        >
          [{modeBadge}]
        </Text>
        <Text color={theme.text.secondary}> — </Text>
        <Text color={theme.text.secondary} dimColor>
          {description}
        </Text>
        <Text color={theme.text.secondary} dimColor>
          {' '}
          (
        </Text>
        <Text color={theme.text.accent}>ctrl+q</Text>
        <Text color={theme.text.secondary} dimColor>
          {' '}
          to toggle)
        </Text>
      </Box>
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
