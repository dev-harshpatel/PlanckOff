'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Shield, Plus, Loader2, AlertCircle } from 'lucide-react';
import { Button, ConfirmModal, useToast } from '@/components/ui';
import { RoleCard } from './RoleCard';
import { RoleFormModal } from './RoleFormModal';
import { RoleWithPermissions } from '@/types/permissions';

export const RoleManagement: React.FC = () => {
  const toast = useToast();
  const [roles, setRoles] = useState<RoleWithPermissions[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleWithPermissions | null>(null);

  // Delete confirmation state
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState<{ id: string; name: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch roles
  const fetchRoles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch('/api/admin/roles');
      const data = await response.json();

      if (data.success) {
        setRoles(data.roles || []);
      } else {
        setError(data.error || 'Failed to fetch roles');
      }
    } catch (err) {
      console.error('Failed to fetch roles:', err);
      setError('Failed to load roles');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  // Open create modal
  const openCreateModal = () => {
    setEditingRole(null);
    setIsModalOpen(true);
  };

  // Open edit modal
  const openEditModal = (role: RoleWithPermissions) => {
    setEditingRole(role);
    setIsModalOpen(true);
  };

  // Open delete confirmation
  const openDeleteModal = (roleId: string, roleName: string) => {
    setRoleToDelete({ id: roleId, name: roleName });
    setIsDeleteModalOpen(true);
  };

  // Confirm delete action
  const confirmDelete = async () => {
    if (!roleToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/admin/roles/${roleToDelete.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Role Deleted', `"${roleToDelete.name}" has been removed.`);
        fetchRoles();
      } else {
        toast.error('Delete Failed', data.error || 'Failed to delete role');
      }
    } catch (err) {
      console.error('Failed to delete role:', err);
      toast.error('Error', 'An unexpected error occurred');
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
      setRoleToDelete(null);
    }
  };

  // Handle delete (called from RoleCard)
  const handleDelete = (roleId: string, roleName: string) => {
    openDeleteModal(roleId, roleName);
  };

  // Handle modal close and refresh
  const handleModalClose = (shouldRefresh: boolean) => {
    setIsModalOpen(false);
    setEditingRole(null);
    if (shouldRefresh) {
      fetchRoles();
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="p-8 w-full mx-auto">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          <span className="ml-3 text-slate-500">Loading roles...</span>
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
          <h3 className="text-lg font-semibold text-red-700 mb-2">Failed to Load Roles</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <Button variant="secondary" onClick={fetchRoles}>
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
          <h1 className="text-2xl font-bold text-slate-900">Role Management</h1>
          <p className="text-slate-500 mt-1">Create and manage roles and their permissions.</p>
        </div>
        <Button variant="primary" icon={Plus} onClick={openCreateModal}>
          Create New Role
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {roles.map(role => (
          <RoleCard
            key={role.id}
            role={role}
            onEdit={() => openEditModal(role)}
            onDelete={() => handleDelete(role.id, role.name)}
          />
        ))}
      </div>

      {roles.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          <Shield className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg">No roles found</p>
          <p className="text-sm mt-2">Create your first role to get started</p>
        </div>
      )}

      {/* Create/Edit Modal */}
      <RoleFormModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        role={editingRole}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setRoleToDelete(null); }}
        onConfirm={confirmDelete}
        title="Delete Role"
        message={`Are you sure you want to delete the "${roleToDelete?.name}" role? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};
