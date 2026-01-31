import { RoleName } from "@/types/team";

// Role hierarchy levels (lower number = higher authority)
export const ROLE_LEVELS = {
  Administrator: 1,
  "Team Lead": 2,
  Estimator: 3,
} as const;

// Role colors for UI
export const ROLE_COLORS: Record<
  RoleName,
  { bg: string; text: string; border: string }
> = {
  Administrator: {
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    border: "border-purple-500/20",
  },
  "Team Lead": {
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/20",
  },
  Estimator: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/20",
  },
};

// Role options for select dropdowns
export const ROLE_OPTIONS: { value: RoleName; label: string }[] = [
  { value: "Administrator", label: "Administrator" },
  { value: "Team Lead", label: "Team Lead" },
  { value: "Estimator", label: "Estimator" },
];

// Invitation token expiry (7 days in milliseconds)
export const INVITATION_EXPIRY_DAYS = 7;
export const INVITATION_EXPIRY_MS =
  INVITATION_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

// Password requirements
export const PASSWORD_REQUIREMENTS = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
};

// Validate password against requirements
export function validatePassword(password: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < PASSWORD_REQUIREMENTS.minLength) {
    errors.push(
      `Password must be at least ${PASSWORD_REQUIREMENTS.minLength} characters`,
    );
  }

  if (PASSWORD_REQUIREMENTS.requireUppercase && !/[A-Z]/.test(password)) {
    errors.push("Password must contain at least one uppercase letter");
  }

  if (PASSWORD_REQUIREMENTS.requireLowercase && !/[a-z]/.test(password)) {
    errors.push("Password must contain at least one lowercase letter");
  }

  if (PASSWORD_REQUIREMENTS.requireNumber && !/\d/.test(password)) {
    errors.push("Password must contain at least one number");
  }

  return { valid: errors.length === 0, errors };
}

// Check if a role can invite another role
export function canInviteRole(
  inviterRole: RoleName,
  inviteeRole: RoleName,
): boolean {
  const inviterLevel = ROLE_LEVELS[inviterRole];
  const inviteeLevel = ROLE_LEVELS[inviteeRole];

  // Admins can invite anyone
  if (inviterRole === "Administrator") {
    return true;
  }

  // Team Leads can only invite Estimators
  if (inviterRole === "Team Lead") {
    return inviteeRole === "Estimator";
  }

  // Estimators cannot invite anyone
  return false;
}

// Get roles that a user can invite
export function getInvitableRoles(userRole: RoleName): RoleName[] {
  switch (userRole) {
    case "Administrator":
      return ["Administrator", "Team Lead", "Estimator"];
    case "Team Lead":
      return ["Estimator"];
    default:
      return [];
  }
}

// Check if a role is protected (cannot be deleted or renamed)
export function isProtectedRole(roleName: string): boolean {
  const protectedRoles = ["Administrator", "Team Lead", "Estimator"];
  return protectedRoles.includes(roleName);
}
