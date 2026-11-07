import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PressableScale } from '../../components/PressableScale';
import { AppColors, radii, spacing, typography } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';
import { isNotRecorded } from '../today/doseWindows';
import type { DoseOccurrence } from '../today/types';
import { AssistantMascot } from './AssistantMascot';
import { useAssistantMascotState } from './useAssistantMascotState';

export interface AssistantFABProps {
  onPress: () => void;
  timeline?: DoseOccurrence[] | null;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SIZE = 56;

export function AssistantFAB({ onPress, timeline, style, testID = 'assistant-fab' }: AssistantFABProps) {
  const { styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const { expression } = useAssistantMascotState(timeline);

  const now = Date.now();
  const notRecorded = timeline?.filter((dose) => isNotRecorded(dose, now)).length ?? 0;
  const accessibilityLabel =
    notRecorded === 0
      ? t('assistant.fabLabel')
      : `${t('assistant.fabLabel')}, ${notRecorded === 1 ? t('assistant.fabNotRecordedOne') : t('assistant.fabNotRecordedMany', { count: notRecorded })}`;

  return (
    <View pointerEvents="box-none" style={[styles.anchor, { bottom: Math.max(insets.bottom, spacing.sm) + 62 }, style]}>
      <PressableScale
        accessibilityHint={t('assistant.fabA11yHint')}
        accessibilityLabel={accessibilityLabel}
        accessibilityRole="button"
        hitSlop={16}
        onPress={onPress}
        style={styles.button}
        testID={testID}
      >
        <View style={styles.portrait}>
          <AssistantMascot accessible={false} expression={expression} size={SIZE - 4} variant="bust" />
        </View>
        {notRecorded > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{notRecorded > 9 ? '9+' : notRecorded}</Text>
          </View>
        ) : null}
      </PressableScale>
    </View>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    anchor: {
      position: 'absolute',
      right: spacing.md,
      zIndex: 10,
    },
    button: {
      height: SIZE,
      width: SIZE,
    },
    portrait: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.controlBorder,
      borderRadius: radii.full,
      borderWidth: 1,
      height: SIZE,
      justifyContent: 'flex-end',
      overflow: 'hidden',
      width: SIZE,
    },
    badge: {
      alignItems: 'center',
      backgroundColor: colors.warning,
      borderColor: colors.canvas,
      borderRadius: radii.full,
      borderWidth: 2,
      height: 22,
      justifyContent: 'center',
      minWidth: 22,
      paddingHorizontal: 4,
      position: 'absolute',
      right: -4,
      top: -4,
    },
    badgeText: {
      ...typography.badge,
      color: colors.white,
      fontVariant: ['tabular-nums'],
    },
  });
