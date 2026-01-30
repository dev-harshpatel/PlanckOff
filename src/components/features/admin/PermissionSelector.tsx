'use client';

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, CheckSquare, Square } from 'lucide-react';
import { GroupedPermissions, PermissionCategory } from '@/types/permissions';

interface PermissionSelectorProps {
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  disabled?: boolean;
}

export const PermissionSelector: React.FC<PermissionSelectorProps> = ({
  selectedIds,
  onChange,
  disabled = false,
}) => {
  const [groupedPermissions, setGroupedPermissions] = useState<GroupedPermissions[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch permissions
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch('/api/admin/permissions?grouped=true');
        const data = await response.json();

        if (data.success) {
          setGroupedPermissions(data.grouped || []);
        } else {
          setError(data.error || 'Failed to fetch permissions');
        }
      } catch (err) {
        console.error('Failed to fetch permissions:', err);
        setError('Failed to load permissions');
      } finally {
        setIsLoading(false);
      }
    };

    fetchPermissions();
  }, []);

  // Toggle individual permission
  const togglePermission = (permissionId: string) => {
    if (selectedIds.includes(permissionId)) {
      onChange(selectedIds.filter(id => id !== permissionId));
    } else {
      onChange([...selectedIds, permissionId]);
    }
  };

  // Toggle all in category
  const toggleCategory = (category: GroupedPermissions) => {
    const categoryIds = category.permissions.map(p => p.id);
    const allSelected = categoryIds.every(id => selectedIds.includes(id));

    if (allSelected) {
      // Deselect all in category
      onChange(selectedIds.filter(id => !categoryIds.includes(id)));
    } else {
      // Select all in category
      const newIds = [...selectedIds];
      categoryIds.forEach(id => {
        if (!newIds.includes(id)) {
          newIds.push(id);
        }
      });
      onChange(newIds);
    }
  };

  const categoryColors: Record<PermissionCategory, string> = {
    Team: 'border-blue-200 bg-blue-50',
    Projects: 'border-green-200 bg-green-50',
    Estimates: 'border-purple-200 bg-purple-50',
    Database: 'border-orange-200 bg-orange-50',
    Settings: 'border-slate-200 bg-slate-50',
    Admin: 'border-red-200 bg-red-50',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
        <span className="ml-2 text-sm text-slate-500">Loading permissions...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-3">
        <AlertCircle className="w-5 h-5 flex-shrink-0" />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  return (
    <div className="space-y-3 max-h-96 overflow-y-auto border border-slate-200 rounded-lg p-3 min-w-[500px]">
      {groupedPermissions.map(group => {
        const categoryIds = group.permissions.map(p => p.id);
        const allSelected = categoryIds.every(id => selectedIds.includes(id));
        const someSelected = categoryIds.some(id => selectedIds.includes(id));

        return (
          <div
            key={group.category}
            className={`border rounded-lg overflow-hidden ${categoryColors[group.category]}`}
          >
            {/* Category Header */}
            <button
              type="button"
              onClick={() => toggleCategory(group)}
              disabled={disabled}
              className="w-full px-4 py-2 flex items-center justify-between hover:bg-black/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2">
                {allSelected ? (
                  <CheckSquare className="w-4 h-4 text-blue-600" />
                ) : someSelected ? (
                  <div className="w-4 h-4 border-2 border-blue-600 bg-blue-100 rounded flex items-center justify-center">
                    <div className="w-2 h-2 bg-blue-600" />
                  </div>
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span className="font-semibold text-sm text-slate-700">{group.category}</span>
              </div>
              <span className="text-xs text-slate-500">
                {categoryIds.filter(id => selectedIds.includes(id)).length} / {categoryIds.length}
              </span>
            </button>

            {/* Permissions List */}
            <div className="px-3 py-2 space-y-1 bg-white/50">
              {group.permissions.map(permission => {
                const isSelected = selectedIds.includes(permission.id);

                return (
                  <label
                    key={permission.id}
                    className={`flex items-start gap-2 p-1.5 rounded cursor-pointer hover:bg-white/80 transition-colors ${
                      disabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => togglePermission(permission.id)}
                      disabled={disabled}
                      className="mt-0.5 w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-800">{permission.name}</div>
                      {permission.description && (
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">{permission.description}</div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}

      {groupedPermissions.length === 0 && (
        <div className="text-center py-8 text-slate-400">
          <p className="text-sm">No permissions available</p>
        </div>
      )}
    </div>
  );
};
