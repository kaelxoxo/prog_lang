export type IncomingInvitation = {
  id: string;
  patientId: string;
  patientName: string;
  invitedByName: string;
  canManageMedications: boolean;
  createdAt: string;
  expiresAt: string;
};

export type CareCircleMember = {
  accountId: string;
  email: string;
  displayName: string;
  role: 'owner' | 'caregiver';
  canManageMedications: boolean;
  joinedAt: string;
};

export type PatientInvitation = {
  id: string;
  email: string;
  canManageMedications: boolean;
  status: 'pending';
  createdAt: string;
  expiresAt: string;
};

export type CareCircleResponse = {
  members: CareCircleMember[];
  invitations: PatientInvitation[];
};
