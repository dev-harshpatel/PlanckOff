import type { Admin } from '@/types/auth';

export interface ProfileResponse {
  success: boolean;
  user?: Admin;
  error?: string;
}

export interface UpdateProfileRequest {
  name: string;
  initials?: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
