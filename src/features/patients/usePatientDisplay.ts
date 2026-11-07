import { useLocale } from '../settings/LocaleProvider';
import type { Patient } from './types';

export function usePatientDisplay(patient?: Patient | null) {
  const { t } = useLocale();
  const isSelf = Boolean(patient?.isSelf);
  return {
    name: isSelf ? t('shell.you') : patient?.displayName ?? '',
    possessive: isSelf ? t('shell.your') : patient?.displayName ?? '',
    isSelf,
  };
}
