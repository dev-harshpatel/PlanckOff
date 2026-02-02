'use client';

import React, { useEffect, useState } from 'react';
import { Briefcase, Building2, Calendar, Check, Hash, MapPin, User } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { ProjectSummary } from '@/types';
import { getDefaultDueDate } from '@/lib/utils/dateUtils';
import { Modal, ModalBody, ModalFooter, useToast } from '@/components/ui';
import { FormField, SelectField } from '@/components/ui';
import { Button } from '@/components/ui';

interface TeamMemberDropdownItem {
    id: string;
    name: string;
    role: string;
}

interface ProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (project: ProjectSummary) => void;
    projectToEdit?: ProjectSummary | null;
    teamMembers?: TeamMemberDropdownItem[];
}

export const ProjectModal: React.FC<ProjectModalProps> = ({
    isOpen,
    onClose,
    onSubmit,
    projectToEdit,
    teamMembers = []
}) => {
    const [formData, setFormData] = useState({
        name: '',
        company: '',
        projectNumber: '',
        dueDate: '',
        status: 'Working Project Progress' as ProjectSummary['status'],
        assignedTo: '',
        location: ''
    });

    useEffect(() => {
        if (projectToEdit) {
            // Find the team member ID that matches the assigned name
            const assignedMember = teamMembers.find(t => t.name === projectToEdit.assignedTo);
            setFormData({
                name: projectToEdit.name,
                company: projectToEdit.company,
                projectNumber: projectToEdit.projectNumber,
                dueDate: projectToEdit.dueDate ? formatDateForInput(projectToEdit.dueDate) : '',
                status: projectToEdit.status,
                assignedTo: assignedMember?.id || '',
                location: projectToEdit.location || ''
            });
        } else {
            // Reset form for new project
            setFormData({
                name: '',
                company: '',
                projectNumber: '',
                dueDate: '',
                status: 'Working Project Progress',
                assignedTo: teamMembers.length > 0 ? teamMembers[0].id : '',
                location: ''
            });
        }
    }, [projectToEdit, isOpen, teamMembers]);

    // Helper to format date string for input
    const formatDateForInput = (dateStr: string): string => {
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '';
            return date.toISOString().split('T')[0];
        } catch {
            return '';
        }
    };

    // Helper to format date for display
    const formatDateForDisplay = (dateStr: string): string => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('en-US', {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            });
        } catch {
            return dateStr;
        }
    };

    const toast = useToast();

    const validateForm = (): boolean => {
        const missingFields: string[] = [];

        if (!formData.name.trim()) {
            missingFields.push('Project Name');
        }
        if (!formData.company.trim()) {
            missingFields.push('Client / Company');
        }
        if (!formData.location.trim()) {
            missingFields.push('Project Location');
        }
        if (!formData.dueDate) {
            missingFields.push('Due Date');
        }
        if (!formData.assignedTo) {
            missingFields.push('Assign To');
        }
        if (!formData.status) {
            missingFields.push('Status');
        }

        if (missingFields.length > 0) {
            if (missingFields.length === 1) {
                toast.error('Required Field Missing', `Please fill in ${missingFields[0]}`);
            } else {
                toast.error('Required Fields Missing', `Please fill in: ${missingFields.join(', ')}`);
            }
            return false;
        }

        return true;
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        if (!validateForm()) return;

        const selectedMember = teamMembers.find(t => t.id === formData.assignedTo);

        const projectData: ProjectSummary = {
            id: projectToEdit ? projectToEdit.id : uuidv4(),
            name: formData.name.trim(),
            company: formData.company.trim(),
            projectNumber: formData.projectNumber || `P-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
            dueDate: formatDateForDisplay(formData.dueDate),
            status: formData.status,
            assignedTo: selectedMember?.name || '',
            location: formData.location.trim()
        };

        onSubmit(projectData);
        onClose();
    };

    const isEditMode = !!projectToEdit;

    // Build team member options - Assign To is now required
    const teamMemberOptions = [
        { value: '', label: 'Select a team member...' },
        ...teamMembers.map(m => ({
            value: m.id,
            label: `${m.name} (${m.role})`
        }))
    ];

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditMode ? 'Edit Project' : 'New Project'}
            size="xl"
        >
            <form onSubmit={handleSubmit}>
                <ModalBody className="space-y-4">

                    <FormField
                        label="Project Name"
                        icon={Briefcase}
                        type="text"
                        required
                        autoFocus={!isEditMode}
                        placeholder="e.g. Skyline Apartments Phase 2"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            label="Client / Company"
                            icon={Building2}
                            type="text"
                            required
                            placeholder="e.g. Apex Construction"
                            value={formData.company}
                            onChange={e => setFormData({ ...formData, company: e.target.value })}
                        />
                        <FormField
                            label="Project Location"
                            icon={MapPin}
                            type="text"
                            required
                            placeholder="e.g. New York, NY"
                            value={formData.location}
                            onChange={e => setFormData({ ...formData, location: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            label="Project #"
                            icon={Hash}
                            type="text"
                            placeholder="Auto-generated if empty"
                            value={formData.projectNumber}
                            onChange={e => setFormData({ ...formData, projectNumber: e.target.value })}
                        />
                        <FormField
                            label="Due Date"
                            icon={Calendar}
                            type="date"
                            required
                            value={formData.dueDate}
                            onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                        />
                    </div>

                    <SelectField
                        label="Assign To"
                        icon={User}
                        required
                        value={formData.assignedTo}
                        onValueChange={(nextValue) => setFormData({ ...formData, assignedTo: nextValue })}
                        options={teamMemberOptions}
                        placeholder="Select a team member..."
                    />

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Status<span className="text-red-500 ml-1">*</span>
                        </label>
                        <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg gap-1">
                            {[
                                { value: 'Working Project Progress', label: 'In Progress' },
                                { value: 'Under Review', label: 'Review' },
                                { value: 'Submitted', label: 'Submitted' },
                                { value: 'Hold', label: 'Hold' },
                                { value: 'Archive', label: 'Archive' },
                            ].map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, status: option.value as ProjectSummary['status'] })}
                                    className={`flex-1 min-w-[80px] text-xs font-medium py-2 px-2 rounded-md transition-all whitespace-nowrap ${
                                        formData.status === option.value
                                            ? 'bg-white text-emerald-700 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </div>

                </ModalBody>
                <ModalFooter>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={onClose}
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
                        {isEditMode ? 'Save Changes' : 'Create Project'}
                    </Button>
                </ModalFooter>
            </form>
        </Modal>
    );
};
