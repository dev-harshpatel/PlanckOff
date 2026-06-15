import {
  findSessionByToken,
  deleteSessionById,
  isSessionExpired,
  updateSessionExpiry,
} from '@/lib/db/auth';
import type { SessionWithAdmin } from '@/lib/supabase/types';
import type { Admin } from '@/types/auth';
import type { TeamMemberWithRole } from '@/types/team';
import type { RoleName } from '@/types/team';
import { AUTH_CONFIG } from '@/constants/auth';

export interface ResolvedSession {
  session: SessionWithAdmin;
  user: Admin;
  teamMember: TeamMemberWithRole | null;
  renewed: boolean;
  expiresAt: string;
}

export interface ResolveSessionOptions {
  loadTeamMember?: (email: string) => Promise<TeamMemberWithRole | null>;
  cleanupExpired?: boolean;
  renewIfExpiring?: boolean;
}

const buildUserFromSession = (session: SessionWithAdmin): Admin | null => {
  if (!session.team_member) return null;

  return {
    id: session.team_member.id,
    email: session.team_member.email,
    name: session.team_member.name,
    role: (session.team_member.role?.name ?? 'Estimator') as RoleName,
    initials:
      session.team_member.initials ||
      session.team_member.name.charAt(0).toUpperCase(),
  };
};

export async function resolveSessionFromToken(
  token: string,
  options: ResolveSessionOptions = {},
): Promise<ResolvedSession | null> {
  const { data: session, error } = await findSessionByToken(token);

  if (error || !session) {
    return null;
  }

  if (isSessionExpired(session.expires_at)) {
    if (options.cleanupExpired) {
      await deleteSessionById(session.id);
    }
    return null;
  }

  const user = buildUserFromSession(session);
  if (!user) {
    return null;
  }

  let renewed = false;
  let expiresAt = session.expires_at;

  if (options.renewIfExpiring) {
    const expiresAtMs = new Date(session.expires_at).getTime();
    const renewalWindowMs =
      AUTH_CONFIG.SESSION_RENEWAL_WINDOW_HOURS * 60 * 60 * 1000;

    if (expiresAtMs - Date.now() <= renewalWindowMs) {
      const nextExpiry = new Date();
      nextExpiry.setDate(
        nextExpiry.getDate() + AUTH_CONFIG.SESSION_DURATION_DAYS,
      );

      const nextExpiresAt = nextExpiry.toISOString();
      const { error: renewError } = await updateSessionExpiry({
        sessionId: session.id,
        expiresAt: nextExpiresAt,
      });

      if (!renewError) {
        renewed = true;
        expiresAt = nextExpiresAt;
      }
    }
  }

  const teamMember = options.loadTeamMember
    ? await options.loadTeamMember(user.email)
    : null;

  return {
    session,
    user,
    teamMember,
    renewed,
    expiresAt,
  };
}
