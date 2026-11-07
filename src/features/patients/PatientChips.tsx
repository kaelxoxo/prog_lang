import { useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { PressableScale } from '../../components/PressableScale';
import { radii, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';
import { CreatePatientModal } from './CreatePatientModal';
import { PatientSwitcher } from './PatientSwitcher';
import { usePatient } from './PatientProvider';
import type { Patient } from './types';

/** Chips shown before "All people" takes over; keeps the row scannable for families caring for several people. */
export const MAX_PATIENT_CHIPS = 5;
const MAX_CHIP_NAME = 16;
const SCREEN_GUTTER = 20;

function chipName(name: string) {
  return name.length > MAX_CHIP_NAME ? `${name.slice(0, MAX_CHIP_NAME - 1).trimEnd()}…` : name;
}

/**
 * The one place to change the active Patient: a chip per person (list order), "All people" when there are more
 * than MAX_PATIENT_CHIPS, and "+ Add". Shown on every tab, also for a single Self Profile.
 */
export function PatientChips() {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  const { fontScale } = useWindowDimensions();
  const { activePatient, createPatient, isCreating, patients, selectPatient } = usePatient();
  const [isSwitcherVisible, setSwitcherVisible] = useState(false);
  const [isCreatorVisible, setCreatorVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const chipOffsets = useRef(new Map<string, number>());
  const wrap = fontScale > 1.3;

  // The selected chip may sit inside "All people" when it is beyond the first few; keep it visible as a chip anyway.
  const shown: readonly Patient[] = (() => {
    const first = patients.slice(0, MAX_PATIENT_CHIPS);
    if (!activePatient || first.some((patient) => patient.id === activePatient.id)) return first;
    return [...first.slice(0, MAX_PATIENT_CHIPS - 1), activePatient];
  })();
  const hasMore = patients.length > MAX_PATIENT_CHIPS;
  const isOnlySelf = patients.length === 1 && patients[0]?.isSelf;

  useEffect(() => {
    if (wrap || !activePatient) return;
    const x = chipOffsets.current.get(activePatient.id);
    if (x !== undefined) scrollRef.current?.scrollTo({ x: Math.max(0, x - SCREEN_GUTTER), animated: true });
  }, [activePatient, wrap]);

  const chips = (
    <>
      {shown.map((patient) => {
        const selected = patient.id === activePatient?.id;
        const label = patient.isSelf ? t('shell.you') : patient.displayName;
        return (
          <View
            key={patient.id}
            onLayout={(event: LayoutChangeEvent) => chipOffsets.current.set(patient.id, event.nativeEvent.layout.x)}
            style={styles.slot}
          >
            <PressableScale
              accessibilityLabel={t('people.chipA11y', { name: label, relationship: patient.relationshipLabel })}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => selectPatient(patient.id)}
              style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
            >
              <Text numberOfLines={1} style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                {chipName(label)}
              </Text>
            </PressableScale>
          </View>
        );
      })}
      {hasMore ? (
        <PressableScale
          accessibilityLabel={t('people.allA11y', { count: patients.length })}
          accessibilityRole="button"
          onPress={() => setSwitcherVisible(true)}
          containerStyle={styles.slot}
          style={[styles.chip, styles.chipIdle]}
        >
          <Text style={styles.chipLabel}>{t('people.all')}</Text>
        </PressableScale>
      ) : null}
      <PressableScale
        accessibilityLabel={t(isOnlySelf ? 'people.addSomeone' : 'care.addPersonLabel')}
        accessibilityRole="button"
        onPress={() => setCreatorVisible(true)}
        containerStyle={styles.slot}
        style={[styles.chip, styles.chipAdd]}
      >
        <AppIcon color={colors.primaryDark} name="plus" size={16} />
        <Text style={styles.chipAddLabel}>{t(isOnlySelf ? 'people.addSomeone' : 'people.add')}</Text>
      </PressableScale>
    </>
  );

  return (
    <>
      <View accessibilityLabel={t('people.chipsA11y')} accessibilityRole="radiogroup">
        {wrap ? (
          <View style={styles.wrapRow}>{chips}</View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.scrollRow}
            horizontal
            ref={scrollRef}
            showsHorizontalScrollIndicator={false}
            style={styles.scroll}
          >
            {chips}
          </ScrollView>
        )}
      </View>
      {activePatient ? (
        <PatientSwitcher
          activePatientId={activePatient.id}
          onAddPerson={() => setCreatorVisible(true)}
          onClose={() => setSwitcherVisible(false)}
          onSelect={selectPatient}
          patients={patients}
          visible={isSwitcherVisible}
        />
      ) : null}
      <CreatePatientModal
        isCreating={isCreating}
        onClose={() => setCreatorVisible(false)}
        onCreate={createPatient}
        visible={isCreatorVisible}
      />
    </>
  );
}

const createStyles = (colors: AppColors) => StyleSheet.create({
  // Bleed to the screen edges (Home, Today and Medicines all use a 20dp gutter) so chips scroll
  // under the page margin instead of clipping at it, while the first chip lines up with the content.
  scroll: { marginHorizontal: -SCREEN_GUTTER },
  scrollRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: SCREEN_GUTTER },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Chips keep their own width in the scrolling row instead of being squeezed to the visible edge.
  slot: { flexShrink: 0 },
  chip: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radii.full,
    borderWidth: 1,
  },
  chipIdle: { borderColor: colors.controlBorder, backgroundColor: 'transparent' },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primary },
  chipAdd: { borderColor: colors.primaryBorder, borderStyle: 'dashed', backgroundColor: 'transparent' },
  chipLabel: { ...typography.bodyEmphasis, color: colors.ink },
  chipLabelSelected: { color: colors.white },
  chipAddLabel: { ...typography.bodyEmphasis, color: colors.primaryDark },
});
