import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiRequest, errorMessage } from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import type { Patient } from './types';

type PatientContextValue = {
  patients: readonly Patient[];
  activePatient: Patient | null;
  selectPatient: (patientId: string) => void;
  createPatient: (displayName: string) => Promise<Patient>;
  error: string | null;
  isCreating: boolean;
  isLoading: boolean;
  dataUpdatedAt: number;
  retry: () => void;
};

type PatientListResponse = { patients: Patient[] };
type PatientCreateResponse = { patient: Patient };

const PatientContext = createContext<PatientContextValue | null>(null);

export function PatientProvider({ children }: PropsWithChildren) {
  const { session, token } = useAuth();
  const queryClient = useQueryClient();
  const [activePatientId, setActivePatientId] = useState<string | null>(null);
  const queryKey = useMemo(() => ['patients', session?.id] as const, [session?.id]);
  const patientQuery = useQuery({
    queryKey,
    enabled: Boolean(token && session),
    queryFn: () => apiRequest<PatientListResponse>('/patients', { token }),
  });
  const patients = patientQuery.data?.patients ?? [];

  const activePatient =
    patients.find((patient) => patient.id === activePatientId) ?? patients[0] ?? null;

  useEffect(() => {
    if (activePatient && activePatient.id !== activePatientId) {
      setActivePatientId(activePatient.id);
    }
  }, [activePatient, activePatientId]);

  const selectPatient = useCallback((patientId: string) => {
    setActivePatientId(patientId);
  }, []);

  const createMutation = useMutation({
    mutationFn: (displayName: string) =>
      apiRequest<PatientCreateResponse>('/patients', {
        method: 'POST',
        token,
        body: { displayName },
      }),
    onSuccess: ({ patient }) => {
      queryClient.setQueryData<PatientListResponse>(queryKey, (current) => ({
        patients: [...(current?.patients ?? []), patient],
      }));
      setActivePatientId(patient.id);
    },
  });

  const createPatient = useCallback(
    async (displayName: string) => {
      const response = await createMutation.mutateAsync(displayName);
      return response.patient;
    },
    [createMutation],
  );

  const retry = useCallback(() => {
    void patientQuery.refetch();
  }, [patientQuery]);

  const value = useMemo(
    () => ({
      patients,
      activePatient,
      selectPatient,
      createPatient,
      error: patientQuery.error ? errorMessage(patientQuery.error) : null,
      isCreating: createMutation.isPending,
      isLoading: patientQuery.isLoading,
      dataUpdatedAt: patientQuery.dataUpdatedAt,
      retry,
    }),
    [
      activePatient,
      createMutation.isPending,
      createPatient,
      patientQuery.error,
      patientQuery.isLoading,
      patientQuery.dataUpdatedAt,
      patients,
      retry,
      selectPatient,
    ],
  );

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>;
}

export function usePatient() {
  const value = useContext(PatientContext);

  if (!value) {
    throw new Error('usePatient must be used inside PatientProvider.');
  }

  return value;
}
