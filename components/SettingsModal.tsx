import React, { useState } from 'react';
import { X, Save, Key, Users, Settings as SettingsIcon, Shield, Plus, Trash2 } from 'lucide-react';
import { AppSettings, UserRole } from '../types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onSave: (newSettings: AppSettings) => void;
    rolePermissions: Record<UserRole, string[]>;
    onUpdateRoles: React.Dispatch<React.SetStateAction<Record<UserRole, string[]>>>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, rolePermissions, onUpdateRoles: setRolePermissions }) => {
    const [activeTab, setActiveTab] = useState<'general' | 'api' | 'roles'>('general');
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

    // Local role permissions removed in favor of props

    if (!isOpen) return null;

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[600px] flex overflow-hidden flex-col">

                {/* Header */}
                <div className="flex justify-between items-center p-6 border-b border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                            <SettingsIcon className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800">Settings</h2>
                            <p className="text-sm text-slate-500">Configure application preferences</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Sidebar */}
                    <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 space-y-2">
                        <button
                            onClick={() => setActiveTab('general')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'general' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            <SettingsIcon className="w-4 h-4" /> General
                        </button>
                        <button
                            onClick={() => setActiveTab('api')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'api' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            <Key className="w-4 h-4" /> API Configuration
                        </button>
                        <button
                            onClick={() => setActiveTab('roles')}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${activeTab === 'roles' ? 'bg-white text-emerald-600 shadow-sm border border-slate-200' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            <Shield className="w-4 h-4" /> Roles & Permissions
                        </button>
                    </div>

                    {/* Main Panel */}
                    <div className="flex-1 p-8 overflow-y-auto">

                        {/* GENERAL TAB */}
                        {activeTab === 'general' && (
                            <div className="space-y-6">
                                <section>
                                    <h3 className="text-lg font-semibold text-slate-800 mb-4">Appearance</h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="border hover:border-emerald-500 cursor-pointer rounded-lg p-4 bg-slate-50 border-slate-200 relative transition-colors">
                                            <div className="h-20 bg-white border border-slate-200 rounded mb-3"></div>
                                            <p className="font-medium text-slate-700">Light Mode</p>
                                            <div className="absolute top-4 right-4 text-emerald-600"><div className="w-4 h-4 rounded-full border-[5px] border-current"></div></div>
                                        </div>
                                        <div className="border hover:border-emerald-500 cursor-pointer opacity-50 rounded-lg p-4 bg-slate-900 border-slate-700">
                                            <div className="h-20 bg-slate-800 border border-slate-700 rounded mb-3"></div>
                                            <p className="font-medium text-slate-300">Dark Mode (Coming Soon)</p>
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <h3 className="text-lg font-semibold text-slate-800 mb-4">Currency</h3>
                                    <div className="max-w-xs">
                                        <label className="block text-xs font-medium text-slate-500 mb-1">Default Currency</label>
                                        <select
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                            value={localSettings.defaultCurrency || 'USD'}
                                            onChange={(e) => setLocalSettings({ ...localSettings, defaultCurrency: e.target.value as any })}
                                        >
                                            <option value="USD">USD ($)</option>
                                            <option value="CAD">CAD ($)</option>
                                            <option value="EUR">EUR (€)</option>
                                        </select>
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* API TAB */}
                        {activeTab === 'api' && (
                            <div className="space-y-6">
                                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
                                    API Keys are stored locally in your browser. They are never sent to our servers.
                                </div>

                                <section>
                                    <h3 className="text-lg font-semibold text-slate-800 mb-4">Google Gemini AI</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <label className="block text-sm font-medium text-slate-700 mb-1">API Key</label>
                                            <input
                                                type="password"
                                                className="w-full border border-slate-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-mono"
                                                placeholder="sk-..."
                                                value={localSettings.geminiApiKey || ''}
                                                onChange={(e) => setLocalSettings({ ...localSettings, geminiApiKey: e.target.value })}
                                            />
                                            <p className="text-xs text-slate-500 mt-1">Required for AI takeoff automation features.</p>
                                        </div>
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* ROLES TAB */}
                        {activeTab === 'roles' && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-semibold text-slate-800">Role Definitions</h3>
                                    <button
                                        onClick={() => {
                                            const roleName = prompt('Enter new Role Name:');
                                            if (roleName && !rolePermissions[roleName as UserRole]) {
                                                setRolePermissions(prev => ({ ...prev, [roleName]: [] }));
                                            }
                                        }}
                                        className="text-sm text-emerald-600 font-medium hover:underline flex items-center gap-1"
                                    >
                                        <Plus className="w-4 h-4" /> Add Custom Role
                                    </button>
                                </div>

                                <div className="space-y-4">
                                    {(Object.entries(rolePermissions) as [UserRole, string[]][]).map(([role, perms]) => (
                                        <div key={role} className="border border-slate-200 rounded-lg p-4 bg-white hover:border-emerald-200 transition-colors">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                        {role}
                                                        {role !== 'Administrator' && role !== 'Estimator' && role !== 'Team Lead' && role !== 'Senior Estimator' && (
                                                            <button
                                                                onClick={() => {
                                                                    if (confirm(`Delete role "${role}"?`)) {
                                                                        const newRoles = { ...rolePermissions };
                                                                        delete newRoles[role];
                                                                        setRolePermissions(newRoles);
                                                                    }
                                                                }}
                                                                className="text-slate-400 hover:text-red-500"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </h4>
                                                    <p className="text-xs text-slate-500">
                                                        {role === 'Administrator' ? 'Full system access' :
                                                            role === 'Team Lead' ? 'Can manage projects and team members' :
                                                                role === 'Senior Estimator' ? 'Can create and approve estimates' : 'Standard estimator access'}
                                                    </p>
                                                </div>
                                                <span className="bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded">
                                                    {perms.length} Permissions
                                                </span>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {perms.map((p, idx) => (
                                                    <span key={idx} className="inline-flex items-center text-xs bg-emerald-50 text-emerald-700 px-2 py-1 rounded border border-emerald-100 group cursor-default">
                                                        {p}
                                                        <button
                                                            onClick={() => {
                                                                setRolePermissions(prev => ({
                                                                    ...prev,
                                                                    [role]: prev[role].filter(perm => perm !== p)
                                                                }));
                                                            }}
                                                            className="ml-1 text-emerald-400 hover:text-emerald-800 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                                <button
                                                    onClick={() => {
                                                        const newPerm = prompt('Enter Permission Name (e.g. "View Reports"):');
                                                        if (newPerm) {
                                                            setRolePermissions(prev => ({
                                                                ...prev,
                                                                [role]: [...prev[role], newPerm]
                                                            }));
                                                        }
                                                    }}
                                                    className="text-xs text-slate-400 hover:text-emerald-600 px-2 py-1 border border-dashed border-slate-300 rounded hover:border-emerald-300 transition-colors flex items-center gap-1"
                                                >
                                                    <Plus className="w-3 h-3" /> Add
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="px-6 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-md transition-colors flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" /> Save Settings
                    </button>
                </div>
            </div>
        </div>
    );
};
