'use client';

import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, UserCog } from 'lucide-react';
import { Modal, ModalBody, ModalFooter, SelectField, Button } from '@/components/ui';
import { TeamMemberWithRole, Role } from '@/types/team';

interface PromoteDemoteModalProps {
  isOpen: boolean;
  onClose: (shouldRefresh: boolean) => void;
  member: TeamMemberWithRole | null;
}

export const PromoteDemoteModal: React.FC<PromoteDemoteModalProps> = ({
  isOpen,
  onClose,
  member,
}) => {
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetch available roles
  useEffect(() => {
    const fetchRoles = async () => {
      try {
        setIsLoading(true);
        const response = await fetch('/api/admin/roles');
        const data = await response.json();

        if (data.success) {
          setRoles(data.roles || []);
        }
      } catch (err) {
        console.error('Failed to fetch roles:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen) {
      fetchRoles();
    }
  }, [isOpen]);

  // Initialize selected role when member changes
  useEffect(() => {
    if (member) {
      setSelectedRoleId(member.role_id);
      setError(null);
      setSuccess(null);
    }
  }, [member]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!member || !selectedRoleId) {
      return;
    }

    // Check if role actually changed
    if (selectedRoleId === member.role_id) {
      setError('Please select a different role');
      return;
    }

    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/team/members/${member.id}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId: selectedRoleId }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess('Member role updated successfully!');
        setTimeout(() => {
          onClose(true);
        }, 1500);
      } else {
        setError(data.error || 'Failed to update member role');
      }
    } catch (err) {
      console.error('Failed to update member role:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!member) {
    return null;
  }

  const currentRole = roles.find(r => r.id === member.role_id);
  const selectedRole = roles.find(r => r.id === selectedRoleId);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose(false)}
      title="Change Member Role"
      size="md"
    >
      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center gap-3">
              <Check className="w-5 h-5 flex-shrink-0" />
              <span className="text-sm">{success}</span>
            </div>
          )}

          {/* Member Info */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center font-bold text-blue-600">
                {member.initials || member.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
              </div>
              <div>
                <h3 className="font-semibold text-slate-900">{member.name}</h3>
                <p className="text-sm text-slate-600">{member.email}</p>
              </div>
            </div>
          </div>

          {/* Current Role */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Current Role
            </label>
            <div className="px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-700">
              {currentRole?.name || 'Unknown'}
            </div>
          </div>

          {/* New Role Selection */}
          <SelectField
            label="New Role"
            value={selectedRoleId}
            onChange={e => setSelectedRoleId(e.target.value)}
            options={roles.map(role => ({
              value: role.id,
              label: `${role.name} (Level ${role.level})`,
            }))}
            disabled={isSubmitting || isLoading}
          />

          {/* Confirmation Message */}
          {selectedRole && selectedRoleId !== member.role_id && (
            <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-3 rounded-lg">
              <p className="text-sm">
                <strong>{member.name}</strong> will be {selectedRole.level < (currentRole?.level || 999) ? 'promoted' : 'demoted'} from{' '}
                <strong>{currentRole?.name}</strong> to <strong>{selectedRole.name}</strong>.
              </p>
            </div>
          )}
        </ModalBody>

        <ModalFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => onClose(false)}
            fullWidth
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={UserCog}
            fullWidth
            disabled={isSubmitting || isLoading || !!success || selectedRoleId === member.role_id}
            isLoading={isSubmitting}
          >
            {isSubmitting ? 'Updating...' : 'Update Role'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
};
