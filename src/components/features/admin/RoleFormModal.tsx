'use client';

import React, { useState, useEffect } from 'react';
import { Check, AlertCircle, Shield } from 'lucide-react';
import { Modal, ModalBody, ModalFooter, FormField, Button } from '@/components/ui';
import { PermissionSelector } from './PermissionSelector';
import { RoleWithPermissions, RoleFormData } from '@/types/permissions';
import { isProtectedRole } from '@/constants/roles';

interface RoleFormModalProps {
  isOpen: boolean;
  onClose: (shouldRefresh: boolean) => void;
  role?: RoleWithPermissions | null;
}

export const RoleFormModal: React.FC<RoleFormModalProps> = ({ isOpen, onClose, role }) => {
  const isEditMode = !!role;
  
  const [formData, setFormData] = useState<RoleFormData>({
    name: '',
    level: 10,
    description: '',
    permissionIds: [],
  });
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Initialize form when role changes
  useEffect(() => {
    if (role) {
      setFormData({
        name: role.name,
        level: role.level,
        description: role.description || '',
        permissionIds: role.permissions.map(p => p.id),
      });
    } else {
      setFormData({
        name: '',
        level: 10,
        description: '',
        permissionIds: [],
      });
    }
    setError(null);
    setSuccess(null);
  }, [role, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      // Build payload for edit mode - only include changed fields
      let payload: any = {};
      
      if (isEditMode && role) {
        if (formData.name !== role.name && formData.name) {
          payload.name = formData.name;
        }
        if (formData.level !== role.level) {
          payload.level = formData.level;
        }
        if (formData.description !== role.description) {
          payload.description = formData.description;
        }
      }

      // Build final payload
      const finalPayload = isEditMode ? payload : {
        name: formData.name,
        level: formData.level,
        description: formData.description,
        permissionIds: formData.permissionIds,
      };

      // For edit mode, check if we need to update role details
      const hasRoleChanges = isEditMode && role && (Object.keys(payload).length > 0);
      const hasPermissionChanges = isEditMode && role && 
        JSON.stringify(formData.permissionIds.sort()) !== JSON.stringify(role.permissions.map(p => p.id).sort());

      // Update role details if changed (or if creating new role)
      if (!isEditMode || hasRoleChanges) {
        const url = isEditMode ? `/api/admin/roles/${role!.id}` : '/api/admin/roles';
        const method = isEditMode ? 'PUT' : 'POST';

        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(finalPayload),
        });

        const data = await response.json();

        if (!data.success) {
          setError(data.error || `Failed to ${isEditMode ? 'update' : 'create'} role`);
          setIsSubmitting(false);
          return;
        }
      }

      // Update permissions if changed (edit mode only)
      if (hasPermissionChanges) {
        const permResponse = await fetch(`/api/admin/roles/${role!.id}/permissions`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissionIds: formData.permissionIds }),
        });

        const permData = await permResponse.json();
        if (!permData.success) {
          setError(permData.error || 'Failed to update permissions');
          setIsSubmitting(false);
          return;
        }
      }

      setSuccess(isEditMode ? 'Role updated successfully!' : 'Role created successfully!');
      setTimeout(() => {
        onClose(true);
      }, 1500);
    } catch (err) {
      console.error('Failed to submit role:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => onClose(false)}
      title={isEditMode ? 'Edit Role' : 'Create New Role'}
      size="2xl"
    >
      <form onSubmit={handleSubmit}>
        <ModalBody className="space-y-4 max-h-[75vh] overflow-y-auto">
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

          {/* Name and Level in a grid */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              label="Role Name"
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., Project Manager"
              required
              disabled={isSubmitting || (isEditMode && role ? isProtectedRole(role.name) : false)}
            />

            <FormField
              label="Level"
              type="number"
              value={formData.level.toString()}
              onChange={e => setFormData({ ...formData, level: parseInt(e.target.value) || 1 })}
              min={1}
              max={100}
              required
              disabled={isSubmitting}
              helperText="Lower = higher authority"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Description (optional)
            </label>
            <textarea
              value={formData.description}
              onChange={e => setFormData({ ...formData, description: e.target.value })}
              disabled={isSubmitting}
              rows={2}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-slate-50 disabled:text-slate-500 text-sm"
              placeholder="Brief description of this role"
            />
          </div>

          {/* Permissions - Now with more space */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Permissions
            </label>
            <PermissionSelector
              selectedIds={formData.permissionIds}
              onChange={(permissionIds: string[]) => setFormData({ ...formData, permissionIds })}
              disabled={isSubmitting}
            />
          </div>
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
            icon={isEditMode ? Check : Shield}
            fullWidth
            disabled={isSubmitting || !!success}
            isLoading={isSubmitting}
          >
            {isSubmitting
              ? isEditMode ? 'Saving...' : 'Creating...'
              : isEditMode ? 'Save Changes' : 'Create Role'}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
};
