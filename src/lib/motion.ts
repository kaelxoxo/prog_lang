import * as Haptics from 'expo-haptics';
import { Easing, FadeIn, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';

import { durations, easing } from '../theme/tokens';

// Reanimated layout-animation builders live at module scope: built once, not on every render.

/** Strong ease-out for UI motion on the UI thread. */
export const easeOut = Easing.bezier(...easing.out);

/** Content appearing in place: opacity only, so it is kept with reduced motion. */
export const fadeIn = FadeIn.duration(durations.stateChange).easing(easeOut).reduceMotion(ReduceMotion.Never);

/** Content leaving: faster than it arrived, opacity only. */
export const fadeOut = FadeOut.duration(durations.feedback).easing(easeOut).reduceMotion(ReduceMotion.Never);

/**
 * Everything a change pushes or pulls glides to its new frame. Movement, so the system's reduce-motion setting
 * makes it snap; components that already track the setting live pass `layout={undefined}` instead.
 */
export const reflow = LinearTransition.duration(durations.stateChange).easing(easeOut).reduceMotion(ReduceMotion.System);

/**
 * The success haptic for a dose recorded as Taken. Call once per record, on the frame its check starts drawing;
 * the check is the feedback, this only accompanies it. Silent where haptics are unavailable.
 */
export function recordedTakenHaptic() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
}
