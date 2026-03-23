/**
 * Team Repository
 * All team-related database operations
 *
 * This follows the Repository Pattern - isolating database logic
 * from API routes makes code reusable and testable.
 */

import { supabaseAdmin } from '@/lib/supabase/server';
import {
  Role,
  RoleName,
  TeamMember,
  TeamMemberWithRole,
  Invitation,
  InvitationWithRole,
} from '@/types/team';
import { INVITATION_EXPIRY_DAYS } from '@/constants/roles';

// Database table names
const TABLES = {
  ROLES: 'roles',
  TEAM_MEMBERS: 'team_members',
  INVITATIONS: 'invitations',
};

// ==================== ROLES ====================

/**
 * Get all roles
 */
export async function getAllRoles(): Promise<{
  data: Role[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.ROLES)
    .select('*')
    .order('level', { ascending: true });

  return { data, error };
}

/**
 * Get role by name
 */
export async function getRoleByName(name: RoleName): Promise<{
  data: Role | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.ROLES)
    .select('*')
    .eq('name', name)
    .single();

  return { data, error };
}

/**
 * Get role by ID
 */
export async function getRoleById(id: string): Promise<{
  data: Role | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.ROLES)
    .select('*')
    .eq('id', id)
    .single();

  return { data, error };
}

// ==================== TEAM MEMBERS ====================

/**
 * Get all team members with their roles
 */
export async function getAllTeamMembers(): Promise<{
  data: TeamMemberWithRole[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.TEAM_MEMBERS)
    .select(`
      id,
      email,
      name,
      role_id,
      initials,
      status,
      invited_by,
      reports_to,
      created_at,
      updated_at,
      role:roles (
        id,
        name,
        level,
        description,
        created_at
      )
    `)
    .order('created_at', { ascending: true });

  // Transform the data to match our types
  const transformedData = data?.map(member => ({
    ...member,
    role: member.role as unknown as Role,
  })) as TeamMemberWithRole[];

  return { data: transformedData || null, error };
}

/**
 * Get team member by ID
 */
export async function getTeamMemberById(id: string): Promise<{
  data: TeamMemberWithRole | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.TEAM_MEMBERS)
    .select(`
      id,
      email,
      name,
      role_id,
      initials,
      status,
      invited_by,
      reports_to,
      created_at,
      updated_at,
      role:roles (
        id,
        name,
        level,
        description,
        created_at
      )
    `)
    .eq('id', id)
    .single();

  const transformedData = data
    ? {
        ...data,
        role: data.role as unknown as Role,
      }
    : null;

  return { data: transformedData as TeamMemberWithRole | null, error };
}

/**
 * Get team member by email
 */
export async function getTeamMemberByEmail(email: string): Promise<{
  data: TeamMemberWithRole | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.TEAM_MEMBERS)
    .select(`
      id,
      email,
      name,
      role_id,
      initials,
      status,
      invited_by,
      reports_to,
      created_at,
      updated_at,
      role:roles (
        id,
        name,
        level,
        description,
        created_at
      )
    `)
    .eq('email', email.toLowerCase())
    .single();

  const transformedData = data
    ? {
        ...data,
        role: data.role as unknown as Role,
      }
    : null;

  return { data: transformedData as TeamMemberWithRole | null, error };
}

/**
 * Get team member by email for authentication (includes password_hash)
 */
export async function getTeamMemberByEmailForAuth(email: string): Promise<{
  data: TeamMember & { role: Role } | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.TEAM_MEMBERS)
    .select(`
      *,
      role:roles (
        id,
        name,
        level,
        description,
        created_at
      )
    `)
    .eq('email', email.toLowerCase())
    .single();

  const transformedData = data
    ? {
        ...data,
        role: data.role as unknown as Role,
      }
    : null;

  return { data: transformedData, error };
}

/**
 * Create a new team member
 */
export async function createTeamMember(params: {
  email: string;
  name: string;
  password_hash: string;
  role_id: string;
  initials?: string;
  invited_by?: string;
  reports_to?: string;
}): Promise<{
  data: TeamMember | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.TEAM_MEMBERS)
    .insert({
      email: params.email.toLowerCase(),
      name: params.name,
      password_hash: params.password_hash,
      role_id: params.role_id,
      initials: params.initials || params.name.split(' ').map(n => n[0]).join('').toUpperCase(),
      status: 'Active',
      invited_by: params.invited_by,
      reports_to: params.reports_to,
    })
    .select('*')
    .single();

  return { data, error };
}

/**
 * Update team member
 */
export async function updateTeamMember(
  id: string,
  updates: Partial<{
    name: string;
    email: string;
    role_id: string;
    status: string;
    reports_to: string;
    initials: string;
  }>
): Promise<{
  data: TeamMember | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.TEAM_MEMBERS)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  return { data, error };
}

export async function updateTeamMemberPassword(params: {
  id: string;
  passwordHash: string;
}): Promise<{
  error: { message: string; code: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from(TABLES.TEAM_MEMBERS)
    .update({ password_hash: params.passwordHash })
    .eq('id', params.id);

  return { error };
}

/**
 * Delete team member
 */
export async function deleteTeamMember(id: string): Promise<{
  error: { message: string; code: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from(TABLES.TEAM_MEMBERS)
    .delete()
    .eq('id', id);

  return { error };
}

/**
 * Get team members by role
 */
export async function getTeamMembersByRole(roleId: string): Promise<{
  data: TeamMemberWithRole[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.TEAM_MEMBERS)
    .select(`
      id,
      email,
      name,
      role_id,
      initials,
      status,
      invited_by,
      reports_to,
      created_at,
      updated_at,
      role:roles (
        id,
        name,
        level,
        description,
        created_at
      )
    `)
    .eq('role_id', roleId)
    .order('created_at', { ascending: true });

  const transformedData = data?.map(member => ({
    ...member,
    role: member.role as unknown as Role,
  })) as TeamMemberWithRole[];

  return { data: transformedData || null, error };
}

// ==================== INVITATIONS ====================

/**
 * Create a new invitation
 */
export async function createInvitation(params: {
  email: string;
  name: string;
  role_id: string;
  invited_by: string;
}): Promise<{
  data: Invitation | null;
  error: { message: string; code: string } | null;
}> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + INVITATION_EXPIRY_DAYS);

  const { data, error } = await supabaseAdmin
    .from(TABLES.INVITATIONS)
    .insert({
      email: params.email.toLowerCase(),
      name: params.name,
      role_id: params.role_id,
      invited_by: params.invited_by,
      expires_at: expiresAt.toISOString(),
    })
    .select('*')
    .single();

  return { data, error };
}

/**
 * Delete an invitation by ID.
 */
export async function deleteInvitationById(id: string): Promise<{
  error: { message: string; code: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from(TABLES.INVITATIONS)
    .delete()
    .eq('id', id);

  return { error };
}

/**
 * Refresh invitation metadata for resends/regeneration.
 */
export async function updateInvitation(
  id: string,
  updates: Partial<{
    name: string;
    role_id: string;
    expires_at: string;
    used_at: string | null;
  }>,
): Promise<{
  data: Invitation | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.INVITATIONS)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  return { data, error };
}

/**
 * Get invitation by token
 */
export async function getInvitationByToken(token: string): Promise<{
  data: InvitationWithRole | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.INVITATIONS)
    .select(`
      *,
      role:roles (
        id,
        name,
        level,
        description,
        created_at
      )
    `)
    .eq('token', token)
    .single();

  const transformedData = data
    ? {
        ...data,
        role: data.role as unknown as Role,
      }
    : null;

  return { data: transformedData as InvitationWithRole | null, error };
}

/**
 * Mark invitation as used
 */
export async function markInvitationAsUsed(token: string): Promise<{
  error: { message: string; code: string } | null;
}> {
  const { error } = await supabaseAdmin
    .from(TABLES.INVITATIONS)
    .update({ used_at: new Date().toISOString() })
    .eq('token', token);

  return { error };
}

/**
 * Check if invitation is valid (not expired and not used)
 */
export function isInvitationValid(invitation: Invitation): boolean {
  if (invitation.used_at) {
    return false;
  }

  if (new Date(invitation.expires_at) < new Date()) {
    return false;
  }

  return true;
}

/**
 * Get pending invitations for an email
 */
export async function getPendingInvitationsByEmail(email: string): Promise<{
  data: Invitation[] | null;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.INVITATIONS)
    .select('*')
    .eq('email', email.toLowerCase())
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString());

  return { data, error };
}

/**
 * Delete expired invitations (maintenance function)
 */
export async function cleanupExpiredInvitations(): Promise<{
  count: number;
  error: { message: string; code: string } | null;
}> {
  const { data, error } = await supabaseAdmin
    .from(TABLES.INVITATIONS)
    .delete()
    .select('id')
    .lt('expires_at', new Date().toISOString());

  return { count: data?.length || 0, error };
}
