/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { StreamingState } from '../types.js';

/** Queue submission mode */
export type QueueMode = 'all-at-once' | 'one-by-one';

export interface UseMessageQueueOptions {
  isConfigInitialized: boolean;
  streamingState: StreamingState;
  submitQuery: (query: string) => void;
  cancelOngoingRequest: () => void;
}

export interface UseMessageQueueReturn {
  messageQueue: string[];
  addMessage: (message: string) => void;
  clearQueue: () => void;
  flushQueue: () => void;
  getQueuedMessagesText: () => string;
  queueMode: QueueMode;
  toggleQueueMode: () => void;
}

/**
 * Hook for managing message queuing during streaming responses.
 * Allows users to queue messages while the AI is responding and automatically
 * sends them when streaming completes.
 */
export function useMessageQueue({
  isConfigInitialized,
  streamingState,
  submitQuery,
  cancelOngoingRequest,
}: UseMessageQueueOptions): UseMessageQueueReturn {
  const [messageQueue, setMessageQueue] = useState<string[]>([]);
  const [queueMode, setQueueMode] = useState<QueueMode>('all-at-once');

  // Track whether we've already processed the current Idle transition
  // to prevent chain-submission in one-by-one mode
  const hasProcessedIdleRef = useRef(false);
  const prevStreamingStateRef = useRef<StreamingState>(streamingState);
  const prevConfigInitializedRef = useRef(isConfigInitialized);

  // Add a message to the queue
  const addMessage = useCallback((message: string) => {
    const trimmedMessage = message.trim();
    if (trimmedMessage.length > 0) {
      setMessageQueue((prev) => [...prev, trimmedMessage]);
    }
  }, []);

  // Clear the entire queue
  const clearQueue = useCallback(() => {
    setMessageQueue([]);
  }, []);

  // Toggle between all-at-once and one-by-one modes
  const toggleQueueMode = useCallback(() => {
    setQueueMode((prev) =>
      prev === 'all-at-once' ? 'one-by-one' : 'all-at-once',
    );
  }, []);

  // Flush queue: cancel ongoing request then submit all queued messages.
  // IMPORTANT: We cancel first so submitQuery won't return early.
  const flushQueue = useCallback(() => {
    if (messageQueue.length > 0) {
      const combinedMessage = messageQueue.join('\n\n');

      // When Responding: cancel the request so submitQuery won't return early.
      // When WaitingForConfirmation: cancelOngoingRequest is a no-op, so
      // submitQuery will also return early. In that case we DON'T clear the
      // queue — let the confirmation resolve naturally and the auto-submit
      // useEffect will handle it.
      if (streamingState === StreamingState.Responding) {
        cancelOngoingRequest();
        setMessageQueue([]);
        submitQuery(combinedMessage);
      } else if (streamingState === StreamingState.WaitingForConfirmation) {
        // Don't clear queue — submitQuery would return early and lose messages.
        // The auto-submit useEffect will fire when state transitions to Idle.
      } else {
        // Idle or other state — safe to submit directly.
        setMessageQueue([]);
        submitQuery(combinedMessage);
      }
    }
  }, [messageQueue, streamingState, submitQuery, cancelOngoingRequest]);

  // Get all queued messages as a single text string
  const getQueuedMessagesText = useCallback(() => {
    if (messageQueue.length === 0) return '';
    return messageQueue.join('\n\n');
  }, [messageQueue]);

  // Process queued messages when streaming becomes idle or when config initializes
  useEffect(() => {
    // Reset the processed flag when state changes away from Idle
    if (streamingState !== StreamingState.Idle) {
      hasProcessedIdleRef.current = false;
    }

    // Detect transitions: either streaming became Idle, or config just initialized
    const justBecameIdle =
      prevStreamingStateRef.current !== StreamingState.Idle &&
      streamingState === StreamingState.Idle;
    const justConfigured =
      !prevConfigInitializedRef.current && isConfigInitialized;

    prevStreamingStateRef.current = streamingState;
    prevConfigInitializedRef.current = isConfigInitialized;

    // Only process once per trigger event
    if (
      justConfigured &&
      streamingState === StreamingState.Idle &&
      !hasProcessedIdleRef.current &&
      messageQueue.length > 0
    ) {
      hasProcessedIdleRef.current = true;

      if (queueMode === 'one-by-one') {
        // Submit only the first message, leave the rest queued
        const [firstMessage, ...remaining] = messageQueue;
        setMessageQueue(remaining);
        submitQuery(firstMessage);
      } else {
        // Combine all messages with double newlines
        const combinedMessage = messageQueue.join('\n\n');
        setMessageQueue([]);
        submitQuery(combinedMessage);
      }
    } else if (
      justBecameIdle &&
      !hasProcessedIdleRef.current &&
      messageQueue.length > 0
    ) {
      hasProcessedIdleRef.current = true;

      if (queueMode === 'one-by-one') {
        // Submit only the first message, leave the rest queued
        const [firstMessage, ...remaining] = messageQueue;
        setMessageQueue(remaining);
        submitQuery(firstMessage);
      } else {
        // Combine all messages with double newlines
        const combinedMessage = messageQueue.join('\n\n');
        setMessageQueue([]);
        submitQuery(combinedMessage);
      }
    }
  }, [
    isConfigInitialized,
    streamingState,
    messageQueue,
    queueMode,
    submitQuery,
  ]);

  return {
    messageQueue,
    addMessage,
    clearQueue,
    flushQueue,
    getQueuedMessagesText,
    queueMode,
    toggleQueueMode,
  };
}
