'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Mail, Plus, Shield, User, Users, Check, Trash2, Edit2, Loader2, AlertCircle, Send, Settings } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Modal, ModalBody, ModalFooter, FormField, SelectField, Button } from '@/components/ui';
import { TeamMemberWithRole, RoleName, InviteFormData } from '@/types/team';
import { useAuth } from '@/context/AuthContext';
import { ROLE_OPTIONS, getInvitableRoles, ROLE_LEVELS } from '@/constants/roles';

type ModalMode = 'invite' | 'edit';

export const TeamManagement: React.FC = () => {
  const { user } = useAuth();
  const router = useRouter();
  const [members, setMembers] = useState<TeamMemberWithRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>('invite');
  const [editingMember, setEditingMember] = useState<TeamMemberWithRole | null>(null);
  const [preSelectedRole, setPreSelectedRole] = useState<RoleName | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  // Form data
  const [formData, setFormData] = useState<InviteFormData>({
    name: '',
    email: '',
    role: 'Estimator',
  });

  // Get current user's role
  const currentUserRole = (user?.role || 'Estimator') as RoleName;
  const invitableRoles = getInvitableRoles(currentUserRole);

  // Fetch team members
  const fetchMembers = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/team/members');
      const data = await response.json();

      if (data.success) {
        setMembers(data.members || []);
      } else {
        // Check for permission denied (403)
        if (response.status === 403) {
          setError('You do not have permission to access Team Management');
        } else {
          setError(data.error || 'Failed to fetch team members');
        }
      }
    } catch (err) {
      console.error('Failed to fetch team members:', err);
      setError('Failed to load team members');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  // Open invite modal
  const openInviteModal = (role?: RoleName) => {
    setModalMode('invite');
    setEditingMember(null);
    setPreSelectedRole(role || null);
    setFormData({
      name: '',
      email: '',
      role: role || invitableRoles[0] || 'Estimator',
    });
    setSubmitError(null);
    setSubmitSuccess(null);
    setIsModalOpen(true);
  };

  // Open edit modal
  const openEditModal = (member: TeamMemberWithRole) => {
    setModalMode('edit');
    setEditingMember(member);
    setPreSelectedRole(null);
    setFormData({
      name: member.name,
      email: member.email,
      role: member.role.name as RoleName,
    });
    setSubmitError(null);
    setSubmitSuccess(null);
    setIsModalOpen(true);
  };

  // Handle invite
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (data.success) {
        setSubmitSuccess('Invitation sent successfully!');
        // Refresh members list after a short delay
        setTimeout(() => {
          setIsModalOpen(false);
          fetchMembers();
        }, 1500);
      } else {
        setSubmitError(data.error || 'Failed to send invitation');
      }
    } catch (err) {
      console.error('Failed to send invitation:', err);
      setSubmitError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle update
  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/team/members/${editingMember.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          role: formData.role,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setIsModalOpen(false);
        fetchMembers();
      } else {
        setSubmitError(data.error || 'Failed to update member');
      }
    } catch (err) {
      console.error('Failed to update member:', err);
      setSubmitError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle delete
  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to remove this team member?')) {
      return;
    }

    try {
      const response = await fetch(`/api/team/members/${id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        fetchMembers();
      } else {
        alert(data.error || 'Failed to delete member');
      }
    } catch (err) {
      console.error('Failed to delete member:', err);
      alert('An unexpected error occurred');
    }
  };

  // Check if current user can manage a member
  const canManageMember = (member: TeamMemberWithRole): boolean => {
    const currentLevel = ROLE_LEVELS[currentUserRole];
    const memberLevel = ROLE_LEVELS[member.role.name as RoleName];
    return currentLevel < memberLevel && member.id !== user?.id;
  };

  // Get available role options for the modal
  const getAvailableRoleOptions = () => {
    if (preSelectedRole) {
      // When inviting from a role-specific box, only show that role
      return ROLE_OPTIONS.filter(opt => opt.value === preSelectedRole);
    }
    // When using "Add Team Member" button, show all invitable roles
    return ROLE_OPTIONS.filter(opt => invitableRoles.includes(opt.value));
  };

  // Render role section
  const renderRoleSection = (title: string, roleName: RoleName, icon: React.ReactNode) => {
    const roleMembers = members.filter(m => m.role.name === roleName);
    const canInviteToRole = invitableRoles.includes(roleName);

    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-white border border-slate-200 rounded-lg text-slate-500">
              {icon}
            </div>
            <h3 className="font-bold text-slate-800">{title}</h3>
            <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full text-xs font-medium border border-slate-200">
              {roleMembers.length}
            </span>
          </div>
          {canInviteToRole && (
            <Button
              variant="ghost"
              size="sm"
              icon={Plus}
              onClick={() => openInviteModal(roleName)}
            >
              Invite
            </Button>
          )}
        </div>

        <div className="divide-y divide-slate-100">
          {roleMembers.map(member => (
            <div
              key={member.id}
              className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2
                    ${roleName === 'Administrator'
                      ? 'bg-purple-50 text-purple-600 border-purple-100'
                      : roleName === 'Team Lead'
                        ? 'bg-blue-50 text-blue-600 border-blue-100'
                        : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    }`}
                >
                  {member.initials || member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm">
                    {member.name}
                    {member.id === user?.id && (
                      <span className="ml-2 text-xs text-slate-400">(You)</span>
                    )}
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <Mail className="w-3 h-3" />
                    {member.email}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide
                    ${member.status === 'Active'
                      ? 'bg-green-50 text-green-600'
                      : member.status === 'Invited'
                        ? 'bg-amber-50 text-amber-600'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                >
                  {member.status}
                </span>

                {canManageMember(member) && (
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openEditModal(member)}
                      className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"
                      title="Edit Member"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(member.id)}
                      className="p-1.5 text-slate-400 hover:text-red-600 rounded hover:bg-red-50"
                      title="Remove Member"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {roleMembers.length === 0 && (
            <div className="px-6 py-8 text-center text-slate-400 text-sm italic">
              No members in this role.
            </div>
          )}
        </div>
      </div>
    );
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 w-full mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="ml-3 text-slate-500">Loading team members...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-8 w-full mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-red-700 mb-2">Failed to Load Team</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <Button variant="secondary" onClick={fetchMembers}>
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 w-full mx-auto">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Management</h1>
          <p className="text-slate-500 mt-1">Manage roles, permissions, and team members.</p>
        </div>
        <div className="flex items-center gap-3">
          {currentUserRole === 'Administrator' && (
            <Button 
              variant="secondary" 
              icon={Shield} 
              onClick={() => router.push('/admin/roles')}
            >
              Role Management
            </Button>
          )}
          {invitableRoles.length > 0 && (
            <Button variant="primary" icon={Plus} onClick={() => openInviteModal()}>
              Add Team Member
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {renderRoleSection('Administration', 'Administrator', <Shield className="w-4 h-4" />)}
        {renderRoleSection('Team Leads', 'Team Lead', <User className="w-4 h-4" />)}
        {renderRoleSection('Estimators', 'Estimator', <Users className="w-4 h-4" />)}
      </div>

      {/* Invite/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={modalMode === 'edit' ? 'Edit Team Member' : 'Invite Team Member'}
        size="md"
      >
        <form onSubmit={modalMode === 'edit' ? handleUpdate : handleInvite}>
          <ModalBody className="space-y-4">
            {submitError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{submitError}</span>
              </div>
            )}

            {submitSuccess && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-3">
                <Check className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm">{submitSuccess}</span>
              </div>
            )}

            <FormField
              label="Full Name"
              type="text"
              required
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              disabled={isSubmitting}
            />

            <FormField
              label="Email Address"
              type="email"
              required
              placeholder="john@example.com"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              disabled={isSubmitting || modalMode === 'edit'}
            />

            <SelectField
              label="Role"
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value as RoleName })}
              options={getAvailableRoleOptions()}
              disabled={isSubmitting || !!preSelectedRole}
            />

            {modalMode === 'invite' && (
              <p className="text-xs text-slate-500">
                An invitation email will be sent to this address with a link to set their password.
              </p>
            )}
          </ModalBody>

          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              fullWidth
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon={modalMode === 'invite' ? Send : Check}
              fullWidth
              disabled={isSubmitting || !!submitSuccess}
              isLoading={isSubmitting}
            >
              {isSubmitting
                ? modalMode === 'invite'
                  ? 'Sending...'
                  : 'Saving...'
                : modalMode === 'invite'
                  ? 'Send Invitation'
                  : 'Save Changes'}
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
};
