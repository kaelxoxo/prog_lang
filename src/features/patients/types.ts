export type Patient = {
  id: string;
  displayName: string;
  relationshipLabel: string;
  todayMessage: string;
  role: 'owner' | 'caregiver';
  canManageMedications: boolean;
  createdAt: string;
};
