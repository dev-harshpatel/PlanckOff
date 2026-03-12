/**
 * Team and role types
 */

export interface Role {
  id: string;
  name: RoleName;
  level: number;
  description?: string;
  created_at: string;
}

export type RoleName = "Administrator" | "Team Lead" | "Estimator";

export interface TeamMember {
  id: string;
  email: string;
  password_hash?: string;
  name: string;
  role_id: string;
  initials: string | null;
  status: TeamMemberStatus;
  invited_by: string | null;
  reports_to: string | null;
  created_at: string;
  updated_at: string;
}

export type TeamMemberStatus = "Active" | "Invited" | "Inactive";

export interface TeamMemberWithRole extends Omit<TeamMember, "password_hash"> {
  role: Role;
}

export interface Invitation {
  id: string;
  email: string;
  name: string;
  role_id: string;
  token: string;
  invited_by: string | null;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

export interface InvitationWithRole extends Invitation {
  role: Role;
}

export interface InviteRequest {
  email: string;
  name: string;
  role: RoleName;
}

export interface InviteResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface SetPasswordRequest {
  token: string;
  password: string;
}

export interface SetPasswordResponse {
  success: boolean;
  message?: string;
  error?: string;
}

export interface ValidateInvitationResponse {
  valid: boolean;
  invitation?: {
    email: string;
    name: string;
    role: RoleName;
  };
  error?: string;
}

export interface TeamMembersResponse {
  success: boolean;
  members?: TeamMemberWithRole[];
  error?: string;
}

export interface InviteFormData {
  name: string;
  email: string;
  role: RoleName;
}
