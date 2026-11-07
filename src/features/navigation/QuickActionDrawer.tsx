import { useEffect, useRef, useState } from 'react';
import { Animated, BackHandler, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIconName } from '@react-native-vector-icons/lucide';

import { AppIcon } from '../../components/AppIcon';
import { PressableScale } from '../../components/PressableScale';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { durations, easing, radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';

export type QuickActionDrawerProps = {
  visible: boolean;
  onClose: () => void;
  onLogDose: () => void;
  onAddMed: () => void;
  onScanRx: () => void;
  onAskBantay: () => void;
};

/** Off-screen distance for the sheet; it slides this far, never scales. */
const SHEET_OFFSET = 360;
const sheetEasing = Easing.bezier(...easing.drawer);
const exitEasing = Easing.bezier(...easing.out);

export function QuickActionDrawer({ onAddMed, onAskBantay, onClose, onLogDose, onScanRx, visible }: QuickActionDrawerProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();

  const [rendered, setRendered] = useState(visible);
  const translateY = useRef(new Animated.Value(SHEET_OFFSET)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const isClosing = useRef(false);

  const animateOut = (onDone: () => void) => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: durations.stateChange, easing: exitEasing, useNativeDriver: true }),
      ...(reducedMotion
        ? []
        : [Animated.timing(translateY, { toValue: SHEET_OFFSET, duration: durations.stateChange, easing: exitEasing, useNativeDriver: true })]),
    ]).start(onDone);
  };

  useEffect(() => {
    if (visible) {
      isClosing.current = false;
      setRendered(true);
      // Reduced motion: the sheet appears in place and only fades.
      translateY.setValue(reducedMotion ? 0 : SHEET_OFFSET);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: durations.stateChange, easing: exitEasing, useNativeDriver: true }),
        ...(reducedMotion
          ? []
          : [Animated.timing(translateY, { toValue: 0, duration: durations.drawer, easing: sheetEasing, useNativeDriver: true })]),
      ]).start();
    } else if (rendered && !isClosing.current) {
      isClosing.current = true;
      animateOut(() => setRendered(false));
    }
  }, [visible]);

  const close = () => {
    if (isClosing.current) return;
    isClosing.current = true;
    animateOut(() => {
      onClose();
      setRendered(false);
    });
  };

  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => subscription.remove();
  }, [visible]);

  if (!rendered) return null;

  const actions: Array<{ key: string; icon: LucideIconName; title: string; hint: string; onPress: () => void }> = [
    { key: 'log', icon: 'circle-check', title: t('quickActions.logDose'), hint: t('quickActions.logDoseHint'), onPress: onLogDose },
    { key: 'add', icon: 'plus', title: t('quickActions.addMedicine'), hint: t('quickActions.addMedicineHint'), onPress: onAddMed },
    { key: 'scan', icon: 'camera', title: t('quickActions.scanRx'), hint: t('quickActions.scanRxHint'), onPress: onScanRx },
    { key: 'ask', icon: 'message-circle', title: t('quickActions.askBantay'), hint: t('quickActions.askBantayHint'), onPress: onAskBantay },
  ];

  return (
    <Modal animationType="none" onRequestClose={close} statusBarTranslucent transparent visible={rendered}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.backdrop, { opacity }]}>
          <Pressable
            accessibilityLabel={t('quickActions.close')}
            accessibilityRole="button"
            onPress={close}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { opacity, paddingBottom: Math.max(insets.bottom, spacing.md), transform: [{ translateY }] }]}
        >
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              {t('quickActions.title')}
            </Text>
            <PressableScale
              accessibilityLabel={t('quickActions.close')}
              accessibilityRole="button"
              onPress={close}
              style={styles.closeButton}
              targetScale={0.94}
            >
              <AppIcon color={colors.ink} name="x" size={22} />
            </PressableScale>
          </View>

          {actions.map((action) => (
            <PressableScale
              accessibilityHint={action.hint}
              accessibilityLabel={action.title}
              accessibilityRole="button"
              key={action.key}
              onPress={() => {
                close();
                action.onPress();
              }}
              style={styles.row}
              targetScale={0.98}
            >
              <AppIcon color={colors.ink} name={action.icon} size={22} />
              <View style={styles.rowCopy}>
                <Text style={styles.rowTitle}>{action.title}</Text>
                <Text numberOfLines={2} style={styles.rowHint}>
                  {action.hint}
                </Text>
              </View>
              <AppIcon color={colors.inkLine} name="chevron-right" size={18} />
            </PressableScale>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.overlay,
    },
    sheet: {
      width: '100%',
      maxWidth: 540,
      alignSelf: 'center',
      backgroundColor: colors.surfaceElevated,
      borderTopLeftRadius: radii.lg,
      borderTopRightRadius: radii.lg,
      paddingHorizontal: spacing.md,
    },
    handle: {
      width: 36,
      height: 4,
      borderRadius: radii.full,
      backgroundColor: colors.controlBorder,
      alignSelf: 'center',
      marginTop: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.xs,
    },
    title: {
      ...sectionTitle,
      color: colors.ink,
      flex: 1,
    },
    closeButton: {
      width: 48,
      height: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    row: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingVertical: spacing.sm,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      ...typography.bodyEmphasis,
      color: colors.ink,
    },
    rowHint: {
      ...typography.caption,
      color: colors.muted,
    },
  });
