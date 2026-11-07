import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useAuth, type CareSetup } from '../auth/AuthProvider';
import { CareCircleSection } from '../invitations/CareCircleSection';
import { usePatient } from '../patients/PatientProvider';
import { ReminderSettings } from '../reminders/ReminderSettings';
import { useLocale } from './LocaleProvider';

type Props = {
  accountName?: string;
  onBack: () => void;
  onOpenWelcomeStory?: () => void;
  onSignOut: () => void;
};

export function SettingsScreen({ accountName, onBack, onOpenWelcomeStory, onSignOut }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { session, setCareSetup } = useAuth();
  const { patients } = usePatient();
  const selfProfile = patients.find((patient) => patient.isSelf);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState(false);
  const [sharingVisible, setSharingVisible] = useState(false);
  const chooseSetup = async (setup: CareSetup) => {
    if (setupSaving || setup === session?.careSetup) return;
    setSetupSaving(true);
    setSetupError(false);
    try {
      await setCareSetup(setup);
    } catch {
      setSetupError(true);
    } finally {
      setSetupSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.column}>
        <Pressable accessibilityLabel={t('settings.back')} accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <AppIcon color={colors.primaryDark} name="arrow-left" size={18} />
          <Text style={styles.backLabel}>{t('settings.back')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{t('settings.title')}</Text>

        <View style={styles.section}>
          <View style={styles.sectionCopy}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{t('settings.careSetupTitle')}</Text>
            <Text style={styles.body}>{t('settings.careSetupBody')}</Text>
            <Text style={styles.body}>{t('settings.careSetupCurrent', { setup: session?.careSetup ? t(`settings.careSetup.${session.careSetup}`) : t('settings.careSetupNotChosen') })}</Text>
          </View>
          <View accessibilityRole="radiogroup" style={styles.options}>
            {(['self', 'family', 'professional'] as const).map((setup) => {
              const selected = session?.careSetup === setup;
              return (
                <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled: setupSaving }} disabled={setupSaving} key={setup} onPress={() => void chooseSetup(setup)} style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}>
                  <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                  <View style={styles.optionCopy}><Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{t(`settings.careSetup.${setup}`)}</Text></View>
                </Pressable>
              );
            })}
          </View>
          {setupSaving ? <Text accessibilityLiveRegion="polite" style={styles.saved}>{t('settings.careSetupSaving')}</Text> : null}
          {setupError ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{t('settings.careSetupError')}</Text> : null}
        </View>

        {session?.careSetup === 'self' && selfProfile ? (
          <View style={styles.section}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: sharingVisible }} onPress={() => setSharingVisible((value) => !value)} style={({ pressed }) => [styles.option, pressed && styles.pressed]}>
              <AppIcon color={colors.primaryDark} name="users" size={18} />
              <Text style={styles.optionLabel}>{t('settings.shareWithFamily')}</Text>
            </Pressable>
            {sharingVisible ? <CareCircleSection patient={selfProfile} /> : null}
          </View>
        ) : null}

        <ReminderSettings />

        {onOpenWelcomeStory ? (
          <View style={styles.section}>
            <View style={styles.sectionCopy}>
              <View style={styles.sectionHeading}>
                <AppIcon color={colors.inkLine} name="book-open" size={20} />
                <Text accessibilityRole="header" style={styles.sectionTitle}>
                  {t('settings.welcomeStory')}
                </Text>
              </View>
              <Text style={styles.body}>{t('settings.welcomeStoryBody')}</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={onOpenWelcomeStory}
              style={({ pressed }) => [styles.storyReplayButton, pressed && styles.pressed]}
            >
              <AppIcon color={colors.ink} name="rotate-ccw" size={18} />
              <Text style={styles.storyReplayLabel}>{t('settings.replayStory')}</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionCopy}>
            <View style={styles.sectionHeading}>
              <AppIcon color={colors.inkLine} name="user-round" size={20} />
              <Text accessibilityRole="header" style={styles.sectionTitle}>{t('settings.account')}</Text>
            </View>
            <Text style={styles.body}>{t('settings.signedInAs', { name: accountName ?? '' })}</Text>
          </View>
          <Pressable accessibilityLabel={t('care.signOut')} accessibilityRole="button" onPress={onSignOut} style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}>
            <AppIcon color={colors.error} name="log-out" size={18} />
            <View style={styles.signOutCopy}><Text style={styles.signOutLabel}>{t('care.signOut')}</Text><Text style={styles.signOutBody}>{t('settings.signOutBody')}</Text></View>
          </Pressable>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  screen: { flexGrow: 1, paddingBottom: spacing.xl, paddingHorizontal: 20, paddingTop: spacing.md, backgroundColor: colors.canvas },
  column: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing.lg },
  back: {
    minHeight: 48,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingRight: spacing.sm,
  },
  backLabel: { ...typography.bodyEmphasis, color: colors.primaryDark, fontWeight: '700' },
  pressed: { opacity: 0.72 },
  title: { ...typography.hero, color: colors.ink },
  section: {
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.lg,
  },
  sectionCopy: { gap: spacing.xs },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { ...sectionTitle, color: colors.ink },
  body: { ...typography.body, maxWidth: 620, color: colors.muted },
  options: { gap: spacing.sm },
  option: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.canvasSubtle },
  radio: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.controlBorder, borderRadius: 11 },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  optionCopy: { flex: 1, gap: 2 },
  optionLabel: { ...typography.bodyEmphasis, color: colors.ink },
  optionLabelSelected: { color: colors.primaryDark, fontWeight: '700' },
  saved: { ...typography.caption, color: colors.primaryDark },
  error: { ...typography.bodyEmphasis, color: colors.error },
  signOutButton: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.controlBorder,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  signOutCopy: { flex: 1, gap: 2 },
  signOutLabel: { ...typography.bodyEmphasis, color: colors.error, fontWeight: '700' },
  signOutBody: { ...typography.caption, color: colors.muted },
  storyReplayButton: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
  },
  storyReplayLabel: { ...typography.bodyEmphasis, color: colors.ink, fontWeight: '700' },
});
