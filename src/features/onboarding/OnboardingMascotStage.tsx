import { View } from 'react-native';

import { AssistantMascot, type MascotExpression } from '../assistant/AssistantMascot';
import { useLocale } from '../settings/LocaleProvider';
import type { CopyKey } from '../settings/translations';

type Props = {
  slideIndex: number;
  size?: number;
};

const SLIDES: { expression: MascotExpression; label: CopyKey }[] = [
  { expression: 'idle', label: 'onboarding.mascotSlide1' },
  { expression: 'thinking', label: 'onboarding.mascotSlide2' },
  { expression: 'celebration', label: 'onboarding.mascotSlide3' },
];

/** Full-body Bantay on each onboarding slide, standing straight on the paper. */
export function OnboardingMascotStage({ slideIndex, size = 220 }: Props) {
  const { t } = useLocale();
  const slide = SLIDES[slideIndex] ?? SLIDES[0];
  return (
    <View style={{ alignItems: 'center', height: size + 36, justifyContent: 'center', width: size + 36 }}>
      <AssistantMascot accessibilityLabel={t(slide.label)} expression={slide.expression} size={size} variant="full" />
    </View>
  );
}
