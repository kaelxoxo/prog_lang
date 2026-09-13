import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { DoseOccurrence } from '../today/types';
import type { MascotExpression } from './AssistantMascot';

export interface UseAssistantMascotStateOptions {
  timeline?: Pick<DoseOccurrence, 'status'>[] | null;
  isProcessing?: boolean;
  initialExpression?: MascotExpression;
}

export interface UseAssistantMascotStateResult {
  expression: MascotExpression;
  setExpression: (expression: MascotExpression) => void;
  startThinking: () => void;
  stopThinking: () => void;
  triggerCelebration: (durationMs?: number) => void;
  isAllDosesCompleted: boolean;
  isThinking: boolean;
}

/**
 * Returns true if the timeline has at least one dose and every dose is recorded as taken or skipped.
 */
export function checkAllDosesCompleted(
  timeline?: Pick<DoseOccurrence, 'status'>[] | null,
): boolean {
  if (!timeline || timeline.length === 0) {
    return false;
  }
  return timeline.every((dose) => dose.status === 'taken' || dose.status === 'skipped');
}

/**
 * Manages assistant mascot expressions and synchronization with query processing and daily dose completion.
 */
export function useAssistantMascotState(
  optionsOrTimeline?: UseAssistantMascotStateOptions | Pick<DoseOccurrence, 'status'>[] | null,
  isProcessingParam?: boolean,
): UseAssistantMascotStateResult {
  // Normalize params whether called with options object or separate arguments
  const options: UseAssistantMascotStateOptions = useMemo(() => {
    if (
      optionsOrTimeline &&
      typeof optionsOrTimeline === 'object' &&
      !Array.isArray(optionsOrTimeline) &&
      ('timeline' in optionsOrTimeline ||
        'isProcessing' in optionsOrTimeline ||
        'initialExpression' in optionsOrTimeline)
    ) {
      return optionsOrTimeline as UseAssistantMascotStateOptions;
    }
    return {
      timeline: (optionsOrTimeline as Pick<DoseOccurrence, 'status'>[] | null | undefined) ?? null,
      isProcessing: isProcessingParam ?? false,
    };
  }, [optionsOrTimeline, isProcessingParam]);

  const { timeline, isProcessing = false, initialExpression } = options;

  // Check if all scheduled doses for the day have been completed
  const isAllDosesCompleted = useMemo(
    () => checkAllDosesCompleted(timeline),
    [timeline],
  );

  // Determine baseline resting expression: celebration when all doses completed, otherwise idle
  const baselineExpression: MascotExpression = isAllDosesCompleted ? 'celebration' : 'idle';

  const [expression, setExpressionState] = useState<MascotExpression>(() => {
    if (initialExpression) return initialExpression;
    if (isProcessing) return 'thinking';
    return baselineExpression;
  });

  const [manualThinking, setManualThinking] = useState(false);
  const celebrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync with query processing changes (e.g. during async query evaluation)
  const prevProcessingRef = useRef(isProcessing);
  useEffect(() => {
    if (prevProcessingRef.current && !isProcessing) {
      // Query completed -> auto-revert from thinking to baseline (celebration or idle)
      setExpressionState(baselineExpression);
      setManualThinking(false);
    } else if (!prevProcessingRef.current && isProcessing) {
      // Query started -> enter thinking state
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current);
        celebrationTimerRef.current = null;
      }
      setExpressionState('thinking');
    }
    prevProcessingRef.current = isProcessing;
  }, [isProcessing, baselineExpression]);

  // Sync with dose completion changes (e.g. recording the last dose of the day)
  const prevAllCompletedRef = useRef(isAllDosesCompleted);
  useEffect(() => {
    if (prevAllCompletedRef.current !== isAllDosesCompleted) {
      prevAllCompletedRef.current = isAllDosesCompleted;
      // If not actively thinking or processing, update expression to reflect completion
      if (!isProcessing && !manualThinking) {
        setExpressionState(isAllDosesCompleted ? 'celebration' : 'idle');
      }
    }
  }, [isAllDosesCompleted, isProcessing, manualThinking]);

  // Clean up any celebration timer on unmount
  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current);
      }
    };
  }, []);

  const startThinking = useCallback(() => {
    if (celebrationTimerRef.current) {
      clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = null;
    }
    setManualThinking(true);
    setExpressionState('thinking');
  }, []);

  const stopThinking = useCallback(() => {
    setManualThinking(false);
    setExpressionState(baselineExpression);
  }, [baselineExpression]);

  const triggerCelebration = useCallback(
    (durationMs = 3500) => {
      if (celebrationTimerRef.current) {
        clearTimeout(celebrationTimerRef.current);
      }
      setExpressionState('celebration');
      celebrationTimerRef.current = setTimeout(() => {
        celebrationTimerRef.current = null;
        setExpressionState(baselineExpression);
      }, durationMs);
    },
    [baselineExpression],
  );

  const setExpression = useCallback((newExpr: MascotExpression) => {
    if (celebrationTimerRef.current) {
      clearTimeout(celebrationTimerRef.current);
      celebrationTimerRef.current = null;
    }
    setManualThinking(newExpr === 'thinking');
    setExpressionState(newExpr);
  }, []);

  const isThinking = expression === 'thinking' || isProcessing || manualThinking;

  return {
    expression,
    setExpression,
    startThinking,
    stopThinking,
    triggerCelebration,
    isAllDosesCompleted,
    isThinking,
  };
}
