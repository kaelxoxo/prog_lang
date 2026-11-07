import { useCallback, useEffect, useRef, useState } from 'react';

import { isNotRecorded, isRecorded } from '../today/doseWindows';
import type { DoseOccurrence } from '../today/types';
import type { MascotExpression } from './AssistantMascot';

/**
 * Bantay's resting mood for a day: celebration only once every dose is recorded,
 * attention while any dose is Not Recorded, idle otherwise (including a day with no doses).
 */
export function bantayMoodFor(timeline: DoseOccurrence[] | null | undefined, now: number): MascotExpression {
  if (!timeline || timeline.length === 0) return 'idle';
  if (timeline.every(isRecorded)) return 'celebration';
  return timeline.some((dose) => isNotRecorded(dose, now)) ? 'attention' : 'idle';
}

/**
 * Bantay's expression: thinking while a query runs, otherwise any expression the assistant set,
 * otherwise the day's mood. The assistant's expression lasts until the next query or until the day's mood changes.
 */
export function useAssistantMascotState(timeline?: DoseOccurrence[] | null, isProcessing = false) {
  const mood = bantayMoodFor(timeline, Date.now());
  const [override, setOverride] = useState<MascotExpression | null>(null);

  const previousMood = useRef(mood);
  useEffect(() => {
    if (previousMood.current === mood) return;
    previousMood.current = mood;
    setOverride((current) => (current === 'thinking' ? current : null));
  }, [mood]);

  const wasProcessing = useRef(isProcessing);
  useEffect(() => {
    if (wasProcessing.current && !isProcessing) setOverride(null);
    wasProcessing.current = isProcessing;
  }, [isProcessing]);

  const startThinking = useCallback(() => setOverride('thinking'), []);
  const stopThinking = useCallback(() => setOverride(null), []);

  return {
    expression: isProcessing ? 'thinking' : override ?? mood,
    setExpression: setOverride,
    startThinking,
    stopThinking,
  } as const;
}
