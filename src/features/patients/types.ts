export type Patient = {
  id: string;
  displayName: string;
  relationshipLabel: string;
  todayMessage: string;
  role: 'owner' | 'caregiver';
  canManageMedications: boolean;
  primaryCareManagerName?: string;
  createdAt: string;
};
