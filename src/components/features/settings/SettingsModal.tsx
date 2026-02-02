'use client';

import React, { useState } from 'react';
import { Save, Key, Settings as SettingsIcon, Shield, Plus, Trash2, X } from 'lucide-react';
import { AppSettings, UserRole } from '@/types';
import { Button, ConfirmModal, FormField, IconButton, Modal, ModalBody, ModalFooter, SelectField, useToast } from '@/components/ui';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    settings: AppSettings;
    onSave: (newSettings: AppSettings) => void;
    rolePermissions: Record<UserRole, string[]>;
    onUpdateRoles: React.Dispatch<React.SetStateAction<Record<UserRole, string[]>>>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, rolePermissions, onUpdateRoles: setRolePermissions }) => {
    const toast = useToast();
    const [activeTab, setActiveTab] = useState<'general' | 'api' | 'roles'>('general');
    const [localSettings, setLocalSettings] = useState<AppSettings>(settings);

    // Input modal state (for adding roles/permissions)
    const [isInputModalOpen, setIsInputModalOpen] = useState(false);
    const [inputModalTitle, setInputModalTitle] = useState('');
    const [inputModalPlaceholder, setInputModalPlaceholder] = useState('');
    const [inputValue, setInputValue] = useState('');
    const [inputModalCallback, setInputModalCallback] = useState<((value: string) => void) | null>(null);

    // Delete confirmation modal state
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [deleteModalMessage, setDeleteModalMessage] = useState('');
    const [deleteCallback, setDeleteCallback] = useState<(() => void) | null>(null);

    const openInputModal = (title: string, placeholder: string, callback: (value: string) => void) => {
        setInputModalTitle(title);
        setInputModalPlaceholder(placeholder);
        setInputValue('');
        setInputModalCallback(() => callback);
        setIsInputModalOpen(true);
    };

    const handleInputSubmit = () => {
        if (inputValue.trim() && inputModalCallback) {
            inputModalCallback(inputValue.trim());
        }
        setIsInputModalOpen(false);
        setInputValue('');
    };

    const openDeleteModal = (message: string, callback: () => void) => {
        setDeleteModalMessage(message);
        setDeleteCallback(() => callback);
        setIsDeleteModalOpen(true);
    };

    const handleDeleteConfirm = () => {
        if (deleteCallback) {
            deleteCallback();
        }
        setIsDeleteModalOpen(false);
    };

    const handleSave = () => {
        onSave(localSettings);
        onClose();
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Settings"
            size="full"
            closeOnOverlayClick={false}
        >
            <div className="flex h-[600px] overflow-hidden">
                {/* Sidebar */}
                <div className="w-64 bg-slate-50 border-r border-slate-200 p-4 space-y-2">
                    <Button
                        variant={activeTab === 'general' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('general')}
                        icon={SettingsIcon}
                        fullWidth
                        className="justify-start"
                    >
                        General
                    </Button>
                    <Button
                        variant={activeTab === 'api' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('api')}
                        icon={Key}
                        fullWidth
                        className="justify-start"
                    >
                        API Configuration
                    </Button>
                    <Button
                        variant={activeTab === 'roles' ? 'primary' : 'ghost'}
                        onClick={() => setActiveTab('roles')}
                        icon={Shield}
                        fullWidth
                        className="justify-start"
                    >
                        Roles & Permissions
                    </Button>
                </div>

                {/* Main Panel */}
                <ModalBody className="flex-1 p-8 overflow-y-auto">

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
                                        <SelectField
                                            label="Default Currency"
                                            value={localSettings.defaultCurrency || 'USD'}
                                            onValueChange={(nextValue) => setLocalSettings({ ...localSettings, defaultCurrency: nextValue as AppSettings['defaultCurrency'] })}
                                            options={[
                                                { value: 'USD', label: 'USD ($)' },
                                                { value: 'CAD', label: 'CAD (C$)' },
                                                { value: 'EUR', label: 'EUR (€)' }
                                            ]}
                                        />
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
                                        <FormField
                                            label="API Key"
                                            type="password"
                                            placeholder="sk-..."
                                            value={localSettings.geminiApiKey || ''}
                                            onChange={(e) => setLocalSettings({ ...localSettings, geminiApiKey: e.target.value })}
                                            helperText="Required for AI takeoff automation features."
                                            className="font-mono"
                                        />
                                    </div>
                                </section>
                            </div>
                        )}

                        {/* ROLES TAB */}
                        {activeTab === 'roles' && (
                            <div className="space-y-6">
                                <div className="flex justify-between items-center mb-4">
                                    <h3 className="text-lg font-semibold text-slate-800">Role Definitions</h3>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        icon={Plus}
                                        onClick={() => {
                                            openInputModal('Add Custom Role', 'Enter role name...', (roleName) => {
                                                if (!rolePermissions[roleName as UserRole]) {
                                                    setRolePermissions(prev => ({ ...prev, [roleName]: [] }));
                                                    toast.success('Role Added', `"${roleName}" role has been created.`);
                                                } else {
                                                    toast.error('Role Exists', `A role with the name "${roleName}" already exists.`);
                                                }
                                            });
                                        }}
                                    >
                                        Add Custom Role
                                    </Button>
                                </div>

                                <div className="space-y-4">
                                    {(Object.entries(rolePermissions) as [UserRole, string[]][]).map(([role, perms]) => (
                                        <div key={role} className="border border-slate-200 rounded-lg p-4 bg-white hover:border-emerald-200 transition-colors">
                                            <div className="flex justify-between items-start mb-3">
                                                <div>
                                                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                                        {role}
                                                        {role !== 'Administrator' && role !== 'Estimator' && role !== 'Team Lead' && (
                                                            <IconButton
                                                                icon={Trash2}
                                                                variant="danger"
                                                                size="sm"
                                                                onClick={() => {
                                                                    openDeleteModal(`Delete role "${role}"?`, () => {
                                                                        const newRoles = { ...rolePermissions };
                                                                        delete newRoles[role];
                                                                        setRolePermissions(newRoles);
                                                                        toast.success('Role Deleted', `"${role}" has been removed.`);
                                                                    });
                                                                }}
                                                                tooltip="Delete role"
                                                            />
                                                        )}
                                                    </h4>
                                                    <p className="text-xs text-slate-500">
                                                        {role === 'Administrator' ? 'Full system access' :
                                                            role === 'Team Lead' ? 'Can manage projects and team members' :
                                                                'Standard estimator access'}
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
                                                        <IconButton
                                                            icon={X}
                                                            variant="default"
                                                            size="sm"
                                                            onClick={() => {
                                                                setRolePermissions(prev => ({
                                                                    ...prev,
                                                                    [role]: prev[role].filter(perm => perm !== p)
                                                                }));
                                                            }}
                                                            className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            tooltip="Remove permission"
                                                        />
                                                    </span>
                                                ))}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    icon={Plus}
                                                    onClick={() => {
                                                        openInputModal('Add Permission', 'Enter permission name (e.g. "View Reports")...', (newPerm) => {
                                                            setRolePermissions(prev => ({
                                                                ...prev,
                                                                [role]: [...prev[role], newPerm]
                                                            }));
                                                            toast.success('Permission Added', `"${newPerm}" added to ${role}.`);
                                                        });
                                                    }}
                                                    className="text-xs border border-dashed"
                                                >
                                                    Add
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                </ModalBody>
            </div>
            <ModalFooter>
                <Button
                    variant="secondary"
                    onClick={onClose}
                >
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    icon={Save}
                    onClick={handleSave}
                >
                    Save Settings
                </Button>
            </ModalFooter>

            {/* Input Modal for Adding Roles/Permissions */}
            <Modal
                isOpen={isInputModalOpen}
                onClose={() => { setIsInputModalOpen(false); setInputValue(''); }}
                title={inputModalTitle}
                size="sm"
            >
                <ModalBody className="space-y-4">
                    <FormField
                        label="Name"
                        type="text"
                        placeholder={inputModalPlaceholder}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        autoFocus
                    />
                </ModalBody>
                <ModalFooter>
                    <Button
                        variant="secondary"
                        onClick={() => { setIsInputModalOpen(false); setInputValue(''); }}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="primary"
                        onClick={handleInputSubmit}
                        disabled={!inputValue.trim()}
                    >
                        Add
                    </Button>
                </ModalFooter>
            </Modal>

            {/* Delete Confirmation Modal */}
            <ConfirmModal
                isOpen={isDeleteModalOpen}
                onClose={() => setIsDeleteModalOpen(false)}
                onConfirm={handleDeleteConfirm}
                title="Confirm Delete"
                message={deleteModalMessage}
                confirmText="Delete"
                cancelText="Cancel"
                variant="danger"
            />
        </Modal>
    );
};
