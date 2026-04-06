/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMessageQueue } from './useMessageQueue.js';
import { StreamingState } from '../types.js';

describe('useMessageQueue', () => {
  let mockSubmitQuery: ReturnType<typeof vi.fn>;
  let mockCancelOngoingRequest: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockSubmitQuery = vi.fn();
    mockCancelOngoingRequest = vi.fn();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const makeOptions = (
    overrides: Partial<Parameters<typeof useMessageQueue>[0]> = {},
  ) =>
    ({
      isConfigInitialized: true,
      streamingState: StreamingState.Idle,
      submitQuery: mockSubmitQuery,
      cancelOngoingRequest: mockCancelOngoingRequest,
      ...overrides,
    }) as Parameters<typeof useMessageQueue>[0];

  it('should initialize with empty queue', () => {
    const { result } = renderHook(() => useMessageQueue(makeOptions()));

    expect(result.current.messageQueue).toEqual([]);
    expect(result.current.getQueuedMessagesText()).toBe('');
  });

  it('should add messages to queue', () => {
    const { result } = renderHook(() =>
      useMessageQueue(
        makeOptions({ streamingState: StreamingState.Responding }),
      ),
    );

    act(() => {
      result.current.addMessage('Test message 1');
      result.current.addMessage('Test message 2');
    });

    expect(result.current.messageQueue).toEqual([
      'Test message 1',
      'Test message 2',
    ]);
  });

  it('should filter out empty messages', () => {
    const { result } = renderHook(() =>
      useMessageQueue(
        makeOptions({ streamingState: StreamingState.Responding }),
      ),
    );

    act(() => {
      result.current.addMessage('Valid message');
      result.current.addMessage('   ');
      result.current.addMessage('');
      result.current.addMessage('Another valid message');
    });

    expect(result.current.messageQueue).toEqual([
      'Valid message',
      'Another valid message',
    ]);
  });

  it('should clear queue', () => {
    const { result } = renderHook(() =>
      useMessageQueue(
        makeOptions({ streamingState: StreamingState.Responding }),
      ),
    );

    act(() => {
      result.current.addMessage('Test message');
    });

    expect(result.current.messageQueue).toEqual(['Test message']);

    act(() => {
      result.current.clearQueue();
    });

    expect(result.current.messageQueue).toEqual([]);
  });

  it('should return queued messages as text with double newlines', () => {
    const { result } = renderHook(() =>
      useMessageQueue(
        makeOptions({ streamingState: StreamingState.Responding }),
      ),
    );

    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
      result.current.addMessage('Message 3');
    });

    expect(result.current.getQueuedMessagesText()).toBe(
      'Message 1\n\nMessage 2\n\nMessage 3',
    );
  });

  it('should auto-submit queued messages when transitioning to Idle', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useMessageQueue(makeOptions({ streamingState })),
      {
        initialProps: { streamingState: StreamingState.Responding },
      },
    );

    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
    });

    expect(result.current.messageQueue).toEqual(['Message 1', 'Message 2']);

    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).toHaveBeenCalledWith('Message 1\n\nMessage 2');
    expect(result.current.messageQueue).toEqual([]);
  });

  it('should auto-submit queued messages when config initializes while idle', () => {
    const { result, rerender } = renderHook(
      ({ isConfigInitialized }) =>
        useMessageQueue(
          makeOptions({
            isConfigInitialized,
            streamingState: StreamingState.Idle,
          }),
        ),
      {
        initialProps: { isConfigInitialized: false },
      },
    );

    // Add messages while config is not initialized
    act(() => {
      result.current.addMessage('Message A');
      result.current.addMessage('Message B');
    });

    expect(result.current.messageQueue).toEqual(['Message A', 'Message B']);
    expect(mockSubmitQuery).not.toHaveBeenCalled();

    // Config becomes initialized while already idle
    rerender({ isConfigInitialized: true });

    expect(mockSubmitQuery).toHaveBeenCalledWith('Message A\n\nMessage B');
    expect(result.current.messageQueue).toEqual([]);
  });

  it('should not auto-submit when queue is empty', () => {
    const { rerender } = renderHook(
      ({ streamingState }) => useMessageQueue(makeOptions({ streamingState })),
      {
        initialProps: { streamingState: StreamingState.Responding },
      },
    );

    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).not.toHaveBeenCalled();
  });

  it('should not auto-submit when not transitioning to Idle', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useMessageQueue(makeOptions({ streamingState })),
      {
        initialProps: { streamingState: StreamingState.Responding },
      },
    );

    act(() => {
      result.current.addMessage('Message 1');
    });

    rerender({ streamingState: StreamingState.WaitingForConfirmation });

    expect(mockSubmitQuery).not.toHaveBeenCalled();
    expect(result.current.messageQueue).toEqual(['Message 1']);
  });

  it('should handle multiple state transitions correctly', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useMessageQueue(makeOptions({ streamingState })),
      {
        initialProps: { streamingState: StreamingState.Idle },
      },
    );

    rerender({ streamingState: StreamingState.Responding });

    act(() => {
      result.current.addMessage('First batch');
    });

    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).toHaveBeenCalledWith('First batch');
    expect(result.current.messageQueue).toEqual([]);

    rerender({ streamingState: StreamingState.Responding });

    act(() => {
      result.current.addMessage('Second batch');
    });

    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).toHaveBeenCalledWith('Second batch');
    expect(mockSubmitQuery).toHaveBeenCalledTimes(2);
  });

  it('should flush queue immediately and submit combined message', () => {
    const { result } = renderHook(() =>
      useMessageQueue(makeOptions({ streamingState: StreamingState.Idle })),
    );

    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
    });

    expect(result.current.messageQueue).toEqual(['Message 1', 'Message 2']);

    act(() => {
      result.current.flushQueue();
    });

    expect(mockSubmitQuery).toHaveBeenCalledWith('Message 1\n\nMessage 2');
    expect(result.current.messageQueue).toEqual([]);
    expect(mockCancelOngoingRequest).not.toHaveBeenCalled();
  });

  it('should not submit when flushing empty queue', () => {
    const { result } = renderHook(() =>
      useMessageQueue(
        makeOptions({ streamingState: StreamingState.Responding }),
      ),
    );

    act(() => {
      result.current.flushQueue();
    });

    expect(mockSubmitQuery).not.toHaveBeenCalled();
    expect(result.current.messageQueue).toEqual([]);
  });

  it('should cancel ongoing request then submit when flushing while Responding', async () => {
    const { result } = renderHook(() =>
      useMessageQueue(
        makeOptions({ streamingState: StreamingState.Responding }),
      ),
    );

    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
    });

    act(() => {
      result.current.flushQueue();
    });

    expect(mockCancelOngoingRequest).toHaveBeenCalledTimes(1);
    expect(mockCancelOngoingRequest).toHaveBeenCalledWith(true); // skipOnCancelSubmit
    // Queue should be cleared immediately
    expect(result.current.messageQueue).toEqual([]);

    // submitQuery is deferred via setTimeout(0) to allow React state
    // updates to propagate — advance fake timers to trigger it
    await act(async () => {
      vi.advanceTimersByTimeAsync(0);
    });
    expect(mockSubmitQuery).toHaveBeenCalledWith('Message 1\n\nMessage 2');
  });

  it('should NOT clear queue when flushing while WaitingForConfirmation (defers to auto-submit)', () => {
    const { result } = renderHook(() =>
      useMessageQueue(
        makeOptions({ streamingState: StreamingState.WaitingForConfirmation }),
      ),
    );

    act(() => {
      result.current.addMessage('Urgent message');
    });

    act(() => {
      result.current.flushQueue();
    });

    // cancelOngoingRequest is a no-op for WaitingForConfirmation,
    // so flushQueue intentionally does NOT clear the queue or call
    // submitQuery — messages would be lost otherwise. The auto-submit
    // useEffect will handle them when state transitions to Idle.
    expect(mockCancelOngoingRequest).not.toHaveBeenCalled();
    expect(mockSubmitQuery).not.toHaveBeenCalled();
    // Queue is preserved — will be submitted when state becomes Idle
    expect(result.current.messageQueue).toEqual(['Urgent message']);
  });

  it('should auto-submit deferred flush queue when state transitions from WaitingForConfirmation to Idle', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useMessageQueue(makeOptions({ streamingState })),
      {
        initialProps: { streamingState: StreamingState.WaitingForConfirmation },
      },
    );

    act(() => {
      result.current.addMessage('Deferred message');
    });

    // Flush while WaitingForConfirmation — queue preserved
    act(() => {
      result.current.flushQueue();
    });
    expect(result.current.messageQueue).toEqual(['Deferred message']);
    expect(mockSubmitQuery).not.toHaveBeenCalled();

    // State transitions to Idle — auto-submit fires
    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).toHaveBeenCalledWith('Deferred message');
    expect(result.current.messageQueue).toEqual([]);
  });

  it('should initialize with all-at-once mode', () => {
    const { result } = renderHook(() =>
      useMessageQueue(
        makeOptions({ streamingState: StreamingState.Responding }),
      ),
    );

    expect(result.current.queueMode).toBe('all-at-once');
  });

  it('should toggle between queue modes', () => {
    const { result } = renderHook(() =>
      useMessageQueue(
        makeOptions({ streamingState: StreamingState.Responding }),
      ),
    );

    expect(result.current.queueMode).toBe('all-at-once');

    act(() => {
      result.current.toggleQueueMode();
    });
    expect(result.current.queueMode).toBe('one-by-one');

    act(() => {
      result.current.toggleQueueMode();
    });
    expect(result.current.queueMode).toBe('all-at-once');
  });

  it('should submit only first message in one-by-one mode when transitioning to Idle', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useMessageQueue(makeOptions({ streamingState })),
      {
        initialProps: { streamingState: StreamingState.Responding },
      },
    );

    act(() => {
      result.current.toggleQueueMode();
    });

    act(() => {
      result.current.addMessage('Message 1');
      result.current.addMessage('Message 2');
      result.current.addMessage('Message 3');
    });

    expect(result.current.messageQueue).toEqual([
      'Message 1',
      'Message 2',
      'Message 3',
    ]);

    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).toHaveBeenCalledWith('Message 1');
    expect(result.current.messageQueue).toEqual(['Message 2', 'Message 3']);
  });

  it('should continue submitting remaining messages in one-by-one mode across transitions', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useMessageQueue(makeOptions({ streamingState })),
      {
        initialProps: { streamingState: StreamingState.Responding },
      },
    );

    act(() => {
      result.current.toggleQueueMode();
    });

    act(() => {
      result.current.addMessage('Msg A');
      result.current.addMessage('Msg B');
    });

    rerender({ streamingState: StreamingState.Idle });
    expect(mockSubmitQuery).toHaveBeenCalledWith('Msg A');
    expect(result.current.messageQueue).toEqual(['Msg B']);

    rerender({ streamingState: StreamingState.Responding });

    rerender({ streamingState: StreamingState.Idle });
    expect(mockSubmitQuery).toHaveBeenCalledWith('Msg B');
    expect(result.current.messageQueue).toEqual([]);
    expect(mockSubmitQuery).toHaveBeenCalledTimes(2);
  });

  it('should combine all messages in all-at-once mode (default)', () => {
    const { result, rerender } = renderHook(
      ({ streamingState }) => useMessageQueue(makeOptions({ streamingState })),
      {
        initialProps: { streamingState: StreamingState.Responding },
      },
    );

    expect(result.current.queueMode).toBe('all-at-once');

    act(() => {
      result.current.addMessage('First');
      result.current.addMessage('Second');
    });

    rerender({ streamingState: StreamingState.Idle });

    expect(mockSubmitQuery).toHaveBeenCalledWith('First\n\nSecond');
    expect(result.current.messageQueue).toEqual([]);
  });
});
