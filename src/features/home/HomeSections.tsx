import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '../../components/AppIcon';
import { Disclosure } from '../../components/Disclosure';
import { DrawnCheck } from '../../components/DrawnCheck';
import { PressableScale } from '../../components/PressableScale';
import { radii, sectionTitle, spacing, typography, type AppColors } from '../../theme/tokens';
import { useThemedStyles } from '../../theme/useTheme';
import { useLocale } from '../settings/LocaleProvider';
import type { TimeSlot } from '../today/doseWindows';
import { actionableAt, type DoseOccurrence } from '../today/types';
import type { RefillAlert } from './careInsights';

export function formatTime(iso: string, localeTag: string) {
  return new Intl.DateTimeFormat(localeTag, { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(
    new Date(iso),
  );
}

export function doseAmount(dose: DoseOccurrence) {
  const strength = dose.strengthValue && dose.strengthUnit ? ` · ${dose.strengthValue} ${dose.strengthUnit}` : '';
  return `${dose.doseQuantity} ${dose.doseUnit}${strength}`;
}

/** Doses being recorded: the one in flight, and ones just recorded whose check is still showing. */
export type RecordingState = {
  pendingId: string | null;
  settling: ReadonlyMap<string, DoseOccurrence>;
};

type DoseRowProps = {
  dose: DoseOccurrence;
  /** Left column; omitted inside a Time Slot, whose header already shows the time. */
  time?: string;
  detail: string;
  trailing: ReactNode;
};

function DoseRow({ detail, dose, time, trailing }: DoseRowProps) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <View style={styles.row}>
      {time ? <Text style={styles.rowTime}>{time}</Text> : null}
      <View style={styles.rowCopy}>
        <Text numberOfLines={2} style={styles.rowTitle}>
          {dose.medicationName}
        </Text>
        <Text numberOfLines={2} style={styles.rowDetail}>
          {detail}
        </Text>
      </View>
      {trailing}
    </View>
  );
}

function TakeAction({ dose, onTake, recording }: { dose: DoseOccurrence; onTake: (dose: DoseOccurrence) => void; recording: RecordingState }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();

  if (recording.settling.has(dose.id)) {
    return (
      <View accessibilityLabel={t('home.recordedJustNow', { medicine: dose.medicationName })} accessible style={styles.checkSlot}>
        <DrawnCheck animate color={colors.ink} size={26} />
      </View>
    );
  }

  const saving = recording.pendingId === dose.id;
  return (
    <PressableScale
      accessibilityLabel={t('home.takeA11y', { medicine: dose.medicationName })}
      accessibilityRole="button"
      accessibilityState={{ busy: saving, disabled: recording.pendingId !== null }}
      disabled={recording.pendingId !== null}
      onPress={() => onTake(dose)}
      style={[styles.takeButton, recording.pendingId !== null && !saving && styles.takeButtonIdle]}
    >
      <Text style={styles.takeLabel}>{saving ? t('home.saving') : t('home.take')}</Text>
    </PressableScale>
  );
}

function TextAction({ accessibilityLabel, disabled, label, onPress }: { accessibilityLabel: string; disabled?: boolean; label: string; onPress: () => void }) {
  const { styles } = useThemedStyles(createStyles);
  return (
    <PressableScale
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={styles.textAction}
    >
      <Text style={[styles.textActionLabel, disabled && styles.textActionDisabled]}>{label}</Text>
    </PressableScale>
  );
}

type DueNowProps = {
  slots: TimeSlot[];
  dueSoon: DoseOccurrence[];
  /** First dose of Later today, for the calm empty state. */
  nextDose: DoseOccurrence | null;
  allRecorded: boolean;
  recording: RecordingState;
  onTake: (dose: DoseOccurrence) => void;
};

export function DueNowSection({ allRecorded, dueSoon, nextDose, onTake, recording, slots }: DueNowProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  const isEmpty = slots.length === 0 && dueSoon.length === 0;

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {t('home.dueNowTitle')}
      </Text>

      {isEmpty ? (
        <Text style={styles.calm}>
          {allRecorded
            ? t('home.allRecorded')
            : nextDose
              ? t('home.nothingDueNext', { time: formatTime(actionableAt(nextDose), localeTag) })
              : t('home.nothingDue')}
        </Text>
      ) : null}

      {slots.map((slot) => {
        const time = formatTime(slot.at, localeTag);
        const medicines = slot.doses.map((dose) => dose.medicationName).join(', ');
        return (
          <View key={slot.at} style={styles.ruled}>
            <Disclosure
              accessibilityLabel={t('home.slotA11y', { time, count: slot.doses.length, medicines })}
              chevronColor={colors.inkLine}
              initiallyExpanded
              header={
                <View style={styles.slotHeader}>
                  <View style={styles.notRecordedMarker} />
                  <View style={styles.rowCopy}>
                    <Text style={styles.rowTitle}>{t('home.slotTitle', { time, count: slot.doses.length })}</Text>
                    <Text numberOfLines={1} style={styles.rowDetail}>
                      {medicines}
                    </Text>
                  </View>
                </View>
              }
              headerStyle={styles.disclosureHeader}
            >
              <View style={styles.slotDoses}>
                {slot.doses.map((dose) => (
                  <DoseRow
                    detail={doseAmount(dose)}
                    dose={dose}
                    key={dose.id}
                    trailing={<TakeAction dose={dose} onTake={onTake} recording={recording} />}
                  />
                ))}
              </View>
            </Disclosure>
          </View>
        );
      })}

      {dueSoon.map((dose) => (
        <DoseRow
          detail={doseAmount(dose)}
          dose={dose}
          key={dose.id}
          time={formatTime(actionableAt(dose), localeTag)}
          trailing={<TakeAction dose={dose} onTake={onTake} recording={recording} />}
        />
      ))}
    </View>
  );
}

export function RecordedSection({ doses, onCorrect }: { doses: DoseOccurrence[]; onCorrect: (dose: DoseOccurrence) => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  if (doses.length === 0) return null;

  return (
    <View style={styles.section}>
      <Disclosure
        accessibilityLabel={t('home.recordedA11y', { count: doses.length })}
        chevronColor={colors.inkLine}
        header={<Text accessibilityRole="header" style={styles.sectionTitle}>{t('home.recordedTitle', { count: doses.length })}</Text>}
      >
        {doses.map((dose) => {
          const parts = [t(dose.status === 'skipped' ? 'home.statusSkipped' : 'home.statusTaken')];
          if (dose.recordedByName) parts.push(dose.recordedByName);
          if (dose.recordedAt) parts.push(formatTime(dose.recordedAt, localeTag));
          return (
            <DoseRow
              detail={parts.join(' · ')}
              dose={dose}
              key={dose.id}
              time={formatTime(actionableAt(dose), localeTag)}
              trailing={
                <View style={styles.trailingGroup}>
                  <DrawnCheck color={colors.ink} size={22} />
                  <TextAction
                    accessibilityLabel={t('home.correctA11y', { medicine: dose.medicationName })}
                    label={t('home.correct')}
                    onPress={() => onCorrect(dose)}
                  />
                </View>
              }
            />
          );
        })}
      </Disclosure>
    </View>
  );
}

type LaterTodayProps = {
  doses: DoseOccurrence[];
  recording: RecordingState;
  onRecordEarly: (dose: DoseOccurrence) => void;
};

export function LaterTodaySection({ doses, onRecordEarly, recording }: LaterTodayProps) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { localeTag, t } = useLocale();
  if (doses.length === 0) return null;

  const summary = t(doses.length === 1 ? 'home.laterSummaryOne' : 'home.laterSummaryMany', {
    count: doses.length,
    time: formatTime(actionableAt(doses[0]), localeTag),
  });

  return (
    <View style={styles.section}>
      <Disclosure
        accessibilityLabel={t('home.laterA11y', { summary })}
        chevronColor={colors.inkLine}
        header={
          <View>
            <Text accessibilityRole="header" style={styles.sectionTitle}>{t('home.laterTitle')}</Text>
            <Text style={styles.rowDetail}>{summary}</Text>
          </View>
        }
      >
        {doses.map((dose) => {
          const time = formatTime(actionableAt(dose), localeTag);
          return (
            <DoseRow
              detail={doseAmount(dose)}
              dose={dose}
              key={dose.id}
              time={time}
              trailing={
                recording.settling.has(dose.id) ? (
                  <TakeAction dose={dose} onTake={onRecordEarly} recording={recording} />
                ) : (
                  <TextAction
                    accessibilityLabel={t('home.recordEarlyA11y', { medicine: dose.medicationName, time })}
                    disabled={recording.pendingId !== null}
                    label={recording.pendingId === dose.id ? t('home.saving') : t('home.recordEarly')}
                    onPress={() => onRecordEarly(dose)}
                  />
                )
              }
            />
          );
        })}
      </Disclosure>
    </View>
  );
}

export function RefillSection({ alerts, onOpenMedicines }: { alerts: RefillAlert[]; onOpenMedicines: () => void }) {
  const { colors, styles } = useThemedStyles(createStyles);
  const { t } = useLocale();
  if (alerts.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {t('home.refillTitle')}
      </Text>
      {alerts.map(({ daysLeft, medication }) => {
        const label = t(
          daysLeft === 0 ? 'home.refillLessThanDay' : daysLeft === 1 ? 'home.refillDayLeft' : 'home.refillDaysLeft',
          { medicine: medication.displayName, count: daysLeft },
        );
        return (
          <PressableScale
            accessibilityHint={t('home.refillHint')}
            accessibilityLabel={label}
            accessibilityRole="button"
            key={medication.id}
            onPress={onOpenMedicines}
            style={styles.row}
            targetScale={0.99}
          >
            <Text style={[styles.rowTitle, styles.rowCopy]}>{label}</Text>
            <AppIcon color={colors.inkLine} name="chevron-right" size={18} />
          </PressableScale>
        );
      })}
    </View>
  );
}

const ruledLine = StyleSheet.hairlineWidth;

const createStyles = (colors: AppColors) =>
  StyleSheet.create({
    section: {
      borderTopWidth: ruledLine,
      borderTopColor: colors.line,
      paddingTop: spacing.sm,
    },
    sectionTitle: {
      ...sectionTitle,
      color: colors.ink,
      paddingVertical: spacing.xs,
    },
    calm: {
      ...typography.body,
      color: colors.muted,
      paddingVertical: spacing.sm,
    },
    ruled: {
      borderTopWidth: ruledLine,
      borderTopColor: colors.line,
    },
    disclosureHeader: {
      minHeight: 56,
      paddingVertical: spacing.sm,
    },
    slotHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    notRecordedMarker: {
      width: 4,
      alignSelf: 'stretch',
      minHeight: 32,
      borderRadius: radii.full,
      backgroundColor: colors.warning,
    },
    slotDoses: {
      paddingLeft: spacing.sm + 4,
      paddingBottom: spacing.xs,
    },
    row: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
      borderTopWidth: ruledLine,
      borderTopColor: colors.line,
    },
    rowTime: {
      ...typography.caption,
      width: 68,
      color: colors.muted,
      fontVariant: ['tabular-nums'],
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    rowTitle: {
      ...typography.bodyEmphasis,
      color: colors.ink,
    },
    rowDetail: {
      ...typography.caption,
      color: colors.muted,
    },
    trailingGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    checkSlot: {
      minWidth: 72,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    takeButton: {
      minWidth: 72,
      minHeight: 48,
      paddingHorizontal: spacing.md,
      borderRadius: radii.full,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    takeButtonIdle: {
      opacity: 0.5,
    },
    takeLabel: {
      ...typography.bodyEmphasis,
      color: colors.white,
    },
    textAction: {
      minHeight: 48,
      paddingHorizontal: spacing.sm,
      justifyContent: 'center',
    },
    textActionLabel: {
      ...typography.bodyEmphasis,
      color: colors.primaryDark,
    },
    textActionDisabled: {
      color: colors.muted,
    },
  });
