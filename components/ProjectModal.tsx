
import React, { useState, useEffect } from 'react';
import { X, Check, Calendar, Briefcase, Hash, Building2, User, MapPin } from 'lucide-react';
import { ProjectSummary } from '../types';
import { v4 as uuidv4 } from 'uuid';

interface ProjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (project: ProjectSummary) => void;
    projectToEdit?: ProjectSummary | null;
}

// Mock Team Members
const TEAM_MEMBERS = [
    { id: 'u1', name: 'Demo User (Me)' },
    { id: 'u2', name: 'Sarah Jenkins' },
    { id: 'u3', name: 'Mike Ross' }
];

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
                dueDate: projectToEdit.dueDate ? new Date(projectToEdit.dueDate).toISOString().split('T')[0] : '', // Attempt to parse date for input
                status: projectToEdit.status as any,
                assignedTo: TEAM_MEMBERS.find(t => t.name === projectToEdit.assignedTo)?.id || 'u1',
                location: projectToEdit.location || ''
            });
        } else {
            // Reset for new project
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

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.name || !formData.company) return;

        const projectData: ProjectSummary = {
            id: projectToEdit ? projectToEdit.id : uuidv4(),
            name: formData.name,
            company: formData.company,
            projectNumber: formData.projectNumber || `P-${new Date().getFullYear()}-${Math.floor(Math.random() * 1000)}`,
            dueDate: formData.dueDate || new Date(Date.now() + 12096e5).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
            status: formData.status,
            assignedTo: TEAM_MEMBERS.find(t => t.id === formData.assignedTo)?.name || 'Unassigned',
            location: formData.location
        };

        onSubmit(projectData);
        onClose();
    };

    const isEditMode = !!projectToEdit;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200">

                <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
                    <h2 className="text-lg font-bold text-slate-800">{isEditMode ? 'Edit Project' : 'New Project'}</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Project Name</label>
                        <div className="relative">
                            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <input
                                autoFocus={!isEditMode}
                                type="text"
                                required
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                                placeholder="e.g. Skyline Apartments Phase 2"
                                value={formData.name}
                                onChange={e => setFormData({ ...formData, name: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Client / Company</label>
                            <div className="relative">
                                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    required
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                                    placeholder="e.g. Apex Construction"
                                    value={formData.company}
                                    onChange={e => setFormData({ ...formData, company: e.target.value })}
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Project Location</label>
                            <div className="relative">
                                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                                    placeholder="e.g. New York, NY"
                                    value={formData.location}
                                    onChange={e => setFormData({ ...formData, location: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Project #</label>
                            <div className="relative">
                                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                                    placeholder="Optional"
                                    value={formData.projectNumber}
                                    onChange={e => setFormData({ ...formData, projectNumber: e.target.value })}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Due Date</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="date"
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-slate-600"
                                    value={formData.dueDate}
                                    onChange={e => setFormData({ ...formData, dueDate: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Assign To</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                            <select
                                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all appearance-none cursor-pointer"
                                value={formData.assignedTo}
                                onChange={e => setFormData({ ...formData, assignedTo: e.target.value })}
                            >
                                {TEAM_MEMBERS.map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Status</label>
                        <div className="flex bg-slate-100 p-1 rounded-lg">
                            {(['Working Project Progress', 'Under Review', 'Submitted', 'Hold', 'Archive'] as const).map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setFormData({ ...formData, status: s })}
                                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${formData.status === s
                                        ? 'bg-white text-emerald-700 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg text-sm font-semibold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
                        >
                            <Check className="w-4 h-4" /> {isEditMode ? 'Save Changes' : 'Create Project'}
                        </button>
                    </div>

                </form>
            </div>
        </div>
    );
};
