import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { radii, spacing, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from './LocaleProvider';
import type { Locale } from './translations';

type Props = { accountName?: string; onBack: () => void; onSignOut: () => void };

export function SettingsScreen({ accountName, onBack, onSignOut }: Props) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { locale, setLocale, t } = useLocale();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const selectLocale = async (nextLocale: Locale) => {
    if (nextLocale === locale || saving) return;
    setSaving(true);
    setError(false);
    try {
      await setLocale(nextLocale);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.column}>
        <Pressable accessibilityLabel={t('settings.back')} accessibilityRole="button" onPress={onBack} style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <AppIcon color={colors.primaryDark} name="arrow-left" size={20} />
          <Text style={styles.backLabel}>{t('settings.back')}</Text>
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>{t('settings.title')}</Text>

        <View style={styles.section}>
          <View style={styles.sectionCopy}>
            <View style={styles.sectionHeading}><AppIcon color={colors.ink} name="languages" size={21} /><Text accessibilityRole="header" style={styles.sectionTitle}>{t('settings.language')}</Text></View>
            <Text style={styles.body}>{t('settings.languageBody')}</Text>
          </View>
          <View accessibilityRole="radiogroup" style={styles.options}>
            {(['en', 'fil'] as const).map((option) => {
              const selected = locale === option;
              return (
                <Pressable
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected, disabled: saving }}
                  disabled={saving}
                  key={option}
                  onPress={() => void selectLocale(option)}
                  style={({ pressed }) => [styles.option, selected && styles.optionSelected, pressed && styles.pressed]}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                  <View style={styles.optionCopy}>
                    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{t(option === 'en' ? 'settings.english' : 'settings.filipino')}</Text>
                    {selected ? <Text style={styles.saved}>{t('settings.saved')}</Text> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {error ? <Text accessibilityLiveRegion="assertive" style={styles.error}>{t('settings.saveError')}</Text> : null}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionCopy}>
            <View style={styles.sectionHeading}><AppIcon color={colors.ink} name="user-round" size={21} /><Text accessibilityRole="header" style={styles.sectionTitle}>{t('settings.account')}</Text></View>
            <Text style={styles.body}>{t('settings.signedInAs', { name: accountName ?? '' })}</Text>
          </View>
          <Pressable accessibilityLabel={t('care.signOut')} accessibilityRole="button" onPress={onSignOut} style={({ pressed }) => [styles.signOutButton, pressed && styles.pressed]}>
            <AppIcon color={colors.error} name="log-out" size={20} />
            <View style={styles.signOutCopy}><Text style={styles.signOutLabel}>{t('care.signOut')}</Text><Text style={styles.signOutBody}>{t('settings.signOutBody')}</Text></View>
          </Pressable>
        </View>

        <View style={styles.coverage}>
          <AppIcon color={colors.muted} name="info" size={19} />
          <View style={styles.coverageCopy}><Text style={styles.coverageTitle}>{t('settings.coverageTitle')}</Text><Text style={styles.body}>{t('settings.coverageBody')}</Text></View>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  screen: { flexGrow: 1, paddingBottom: spacing.xl, paddingHorizontal: 20, paddingTop: spacing.md, backgroundColor: colors.canvas },
  column: { width: '100%', maxWidth: 760, alignSelf: 'center', gap: spacing.lg },
  back: { minHeight: 48, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radii.sm, paddingHorizontal: spacing.sm },
  backLabel: { color: colors.primaryDark, fontSize: 15, fontWeight: '800' },
  pressed: { opacity: 0.72 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '900', letterSpacing: -0.6 },
  section: { gap: spacing.md, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.line, paddingVertical: spacing.lg },
  sectionCopy: { gap: spacing.xs },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  body: { maxWidth: 620, color: colors.muted, fontSize: 15, lineHeight: 22 },
  options: { gap: spacing.sm },
  option: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.controlBorder, borderRadius: radii.md, backgroundColor: colors.white, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  radio: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.controlBorder, borderRadius: 11 },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  optionCopy: { flex: 1, gap: 2 },
  optionLabel: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  optionLabelSelected: { color: colors.primaryDark, fontWeight: '900' },
  saved: { color: colors.primaryDark, fontSize: 13, fontWeight: '700' },
  error: { color: colors.error, fontSize: 14, fontWeight: '700' },
  signOutButton: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radii.md, backgroundColor: colors.errorTint, padding: spacing.md },
  signOutCopy: { flex: 1, gap: 2 },
  signOutLabel: { color: colors.error, fontSize: 16, fontWeight: '800' },
  signOutBody: { color: colors.error, fontSize: 13, lineHeight: 19 },
  coverage: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingTop: spacing.sm },
  coverageCopy: { flex: 1, gap: spacing.xs },
  coverageTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
});
