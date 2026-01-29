'use client';

import React, { useState } from 'react';
import { Mail, Plus, Shield, User, Users, X, Check, Trash2, Edit2 } from 'lucide-react';
import { TeamMember, UserRole } from '@/types';
import { v4 as uuidv4 } from 'uuid';
import { Modal, ModalBody, ModalFooter, FormField, SelectField, Button, IconButton } from '@/components/ui';

const INITIAL_TEAM: TeamMember[] = [
  { id: 't1', name: 'Sarah Jenkins', role: 'Administrator', email: 'sarah@tve-eng.com', initials: 'SJ', status: 'Active' },
  { id: 't2', name: 'Mike Ross', role: 'Senior Estimator', email: 'mike@tve-eng.com', initials: 'MR', status: 'Active' },
  { id: 't3', name: 'Rachel Zane', role: 'Estimator', email: 'rachel@tve-eng.com', initials: 'RZ', status: 'Active' },
  { id: 't4', name: 'Harold Gunderson', role: 'Estimator', email: 'harold@tve-eng.com', initials: 'HG', status: 'Invited' },
];

export const TeamManagement: React.FC = () => {
  const [members, setMembers] = useState<TeamMember[]>(INITIAL_TEAM);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    role: 'Estimator' as UserRole,
    status: 'Active' as 'Active' | 'Invited' | 'Inactive'
  });

  const openModal = (member?: TeamMember) => {
    if (member) {
      setEditingMember(member);
      setFormData({
        name: member.name,
        email: member.email,
        role: member.role || 'Estimator',
        status: member.status
      });
    } else {
      setEditingMember(null);
      setFormData({
        name: '',
        email: '',
        role: 'Estimator',
        status: 'Invited'
      });
    }
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    if (editingMember) {
      setMembers(prev => prev.map(m => m.id === editingMember.id ? ({
        ...m,
        name: formData.name,
        email: formData.email,
        role: formData.role,
        status: formData.status,
        initials: formData.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
      } as TeamMember) : m));
    } else {
      const newMember: TeamMember = {
        id: uuidv4(),
        name: formData.name,
        email: formData.email,
        role: formData.role,
        status: formData.status as TeamMember['status'],
        initials: formData.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
      };
      setMembers(prev => [...prev, newMember]);
    }
    setIsModalOpen(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to remove this team member?')) {
      setMembers(prev => prev.filter(m => m.id !== id));
    }
  };

  const renderRoleSection = (title: string, role: TeamMember['role'], icon: React.ReactNode) => {
    const roleMembers = members.filter(m => m.role === role);

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
          <Button
            variant="ghost"
            size="sm"
            icon={Plus}
            onClick={() => openModal()}
          >
            Invite New
          </Button>
        </div>

        <div className="divide-y divide-slate-100">
          {roleMembers.map(member => (
            <div key={member.id} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 
                  ${member.role === 'Administrator' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                    member.role === 'Senior Estimator' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      'bg-indigo-50 text-indigo-600 border-indigo-100'}`}>
                  {member.initials}
                </div>
                <div>
                  <h4 className="font-semibold text-slate-800 text-sm">{member.name}</h4>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
                    <Mail className="w-3 h-3" />
                    {member.email}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide
                  ${member.status === 'Active' ? 'bg-green-50 text-green-600' : 'bg-slate-100 text-slate-500'}`}>
                  {member.status}
                </span>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => openModal(member)}
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

  return (
    <div className="p-8 w-full mx-auto">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Team Management</h1>
          <p className="text-slate-500 mt-1">Manage roles, permissions, and team members.</p>
        </div>
        <Button
          variant="primary"
          icon={Plus}
          onClick={() => openModal()}
        >
          Add Team Member
        </Button>
      </div>

      <div className="space-y-6">
        {renderRoleSection('Administration', 'Administrator', <Shield className="w-4 h-4" />)}
        {renderRoleSection('Team Leads', 'Team Lead', <Shield className="w-4 h-4" />)}
        {renderRoleSection('Senior Estimators', 'Senior Estimator', <User className="w-4 h-4" />)}
        {renderRoleSection('Estimators', 'Estimator', <Users className="w-4 h-4" />)}
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingMember ? 'Edit Team Member' : 'Add New Member'}
        size="md"
      >
        <form onSubmit={handleSave}>
          <ModalBody className="space-y-4">
            <FormField
              label="Full Name"
              type="text"
              required
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
            <FormField
              label="Email Address"
              type="email"
              required
              placeholder="john@example.com"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
            />
            <SelectField
              label="Role"
              value={formData.role}
              onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
              options={[
                { value: 'Administrator', label: 'Administrator' },
                { value: 'Team Lead', label: 'Team Lead' },
                { value: 'Senior Estimator', label: 'Senior Estimator' },
                { value: 'Estimator', label: 'Estimator' }
              ]}
            />
            <SelectField
              label="Status"
              value={formData.status}
              onChange={e => setFormData({ ...formData, status: e.target.value as any })}
              options={[
                { value: 'Active', label: 'Active' },
                { value: 'Invited', label: 'Invited' },
                { value: 'Inactive', label: 'Inactive' }
              ]}
            />
          </ModalBody>
          <ModalFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsModalOpen(false)}
              fullWidth
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon={Check}
              fullWidth
            >
              Save Member
            </Button>
          </ModalFooter>
        </form>
      </Modal>
    </div>
  );
};
