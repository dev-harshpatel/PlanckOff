'use client';

import React, { useState } from 'react';
import { Shield, Users, Edit2, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { RoleWithPermissions, PermissionCategory } from '@/types/permissions';
import { isProtectedRole } from '@/constants/roles';

interface RoleCardProps {
  role: RoleWithPermissions;
  onEdit: () => void;
  onDelete: () => void;
}

export const RoleCard: React.FC<RoleCardProps> = ({ role, onEdit, onDelete }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const isProtected = isProtectedRole(role.name);

  // Group permissions by category
  const groupedPermissions = role.permissions.reduce((acc, perm) => {
    if (!acc[perm.category]) {
      acc[perm.category] = [];
    }
    acc[perm.category].push(perm);
    return acc;
  }, {} as Record<PermissionCategory, typeof role.permissions>);

  const categoryColors: Record<PermissionCategory, string> = {
    Team: 'bg-blue-50 text-blue-700 border-blue-200',
    Projects: 'bg-green-50 text-green-700 border-green-200',
    Estimates: 'bg-purple-50 text-purple-700 border-purple-200',
    Database: 'bg-orange-50 text-orange-700 border-orange-200',
    Settings: 'bg-slate-50 text-slate-700 border-slate-200',
    Admin: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-5 h-5 text-slate-500" />
              <h3 className="font-bold text-slate-900">{role.name}</h3>
              {isProtected && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium border border-amber-200">
                  Protected
                </span>
              )}
            </div>
            {role.description && (
              <p className="text-sm text-slate-600 mt-1">{role.description}</p>
            )}
            <div className="flex items-center gap-4 mt-2 text-xs text-slate-500">
              <span>Level: {role.level}</span>
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {role.memberCount || 0} {role.memberCount === 1 ? 'member' : 'members'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={onEdit}
              className="p-1.5 text-slate-400 hover:text-blue-600 rounded hover:bg-blue-50"
              title="Edit Role"
            >
              <Edit2 className="w-4 h-4" />
            </button>
            <button
              onClick={onDelete}
              disabled={isProtected}
              className={`p-1.5 rounded ${
                isProtected
                  ? 'text-slate-300 cursor-not-allowed'
                  : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
              }`}
              title={isProtected ? 'Cannot delete protected role' : 'Delete Role'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Permissions Summary */}
      <div className="px-6 py-3 bg-white">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between text-sm text-slate-600 hover:text-slate-900"
        >
          <span className="font-medium">
            {role.permissions.length} {role.permissions.length === 1 ? 'Permission' : 'Permissions'}
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4" />
          ) : (
            <ChevronDown className="w-4 h-4" />
          )}
        </button>

        {isExpanded && (
          <div className="mt-3 space-y-3">
            {Object.entries(groupedPermissions).map(([category, perms]) => (
              <div key={category}>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  {category}
                </h4>
                <div className="flex flex-wrap gap-1.5">
                  {perms.map(perm => (
                    <span
                      key={perm.id}
                      className={`text-xs px-2 py-1 rounded border ${
                        categoryColors[perm.category as PermissionCategory]
                      }`}
                    >
                      {perm.name}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
