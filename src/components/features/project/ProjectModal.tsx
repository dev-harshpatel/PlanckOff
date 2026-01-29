'use client';

import React, { useEffect, useState } from 'react';
import { Briefcase, Building2, Calendar, Check, Hash, MapPin, User } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { ProjectSummary } from '@/types';
import { PROJECT_STATUSES, TEAM_MEMBERS } from '@/constants';
import { getDefaultDueDate } from '@/lib/utils/dateUtils';
import { Modal, ModalBody, ModalFooter } from '@/components/ui';
import { FormField, SelectField } from '@/components/ui';
import { Button, StatusToggle } from '@/components/ui';

interface ProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (project: ProjectSummary) => void;
    projectToEdit?: ProjectSummary | null;
}

export const ProjectModal: React.FC<ProjectModalProps> = ({ isOpen, onClose, onSubmit, projectToEdit }) => {
    const [formData, setFormData] = useState({
        name: '',
        company: '',
        projectNumber: '',
        dueDate: '',
        status: 'Working Project Progress' as const,
        assignedTo: 'u1',
        location: ''
    });

    useEffect(() => {
        if (projectToEdit) {
            setFormData({
                name: projectToEdit.name,
                company: projectToEdit.company,
                projectNumber: projectToEdit.projectNumber,
                dueDate: projectToEdit.dueDate ? new Date(projectToEdit.dueDate).toISOString().split('T')[0] : '',
                status: projectToEdit.status as any,
                assignedTo: TEAM_MEMBERS.find(t => t.name === projectToEdit.assignedTo)?.id || 'u1',
                location: projectToEdit.location || ''
            });
        } else {
            setFormData({
                name: '',
                company: '',
                projectNumber: '',
                dueDate: '',
                status: 'Working Project Progress',
                assignedTo: 'u1',
                location: ''
            });
        }
    }, [projectToEdit, isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.company) return;

        const projectData: ProjectSummary = {
            id: projectToEdit ? projectToEdit.id : uuidv4(),
            name: formData.name,
            company: formData.company,
            projectNumber: formData.projectNumber || `P-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
            dueDate: formData.dueDate || getDefaultDueDate(),
            status: formData.status,
            assignedTo: TEAM_MEMBERS.find(t => t.id === formData.assignedTo)?.name || 'Unassigned',
            location: formData.location
        };

        onSubmit(projectData);
        onClose();
    };

    const isEditMode = !!projectToEdit;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={isEditMode ? 'Edit Project' : 'New Project'}
            size="lg"
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
                            placeholder="Optional"
                            value={formData.projectNumber}
                            onChange={e => setFormData({ ...formData, projectNumber: e.target.value })}
                        />
                        <FormField
                            label="Due Date"
                            icon={Calendar}
                            type="date"
                            value={formData.dueDate}
                            onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                        />
                    </div>

                    <SelectField
                        label="Assign To"
                        icon={User}
                        value={formData.assignedTo}
                        onChange={e => setFormData({ ...formData, assignedTo: e.target.value })}
                        options={TEAM_MEMBERS.map(m => ({ value: m.id, label: m.name }))}
                    />

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Status</label>
                        <StatusToggle
                            options={PROJECT_STATUSES}
                            value={formData.status}
                            onChange={(status) => setFormData({ ...formData, status: status as any })}
                        />
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
