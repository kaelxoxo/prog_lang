import { useAuth } from '../auth/AuthProvider';
import { useLocale } from '../settings/LocaleProvider';
import { usePatient } from './PatientProvider';
import type { Patient } from './types';

export function usePatientDisplay(patient?: Patient | null) {
  const { session } = useAuth();
  const { t } = useLocale();
  const { patients } = usePatient();
  const isSelf = Boolean(patient?.isSelf);
  return {
    name: isSelf ? t('shell.you') : patient?.displayName ?? '',
    possessive: isSelf ? t('shell.your') : patient?.displayName ?? '',
    isSelf,
    showSelector: session?.careSetup !== 'self' || patients.length > 1,
    isProfessional: session?.careSetup === 'professional',
    showCareCircle: session?.careSetup !== 'self',
  };
}
