import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** Tracks the system "reduce motion" setting. With it on, keep fades and drop movement. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => { if (active) setReduced(value); })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduced;
}
