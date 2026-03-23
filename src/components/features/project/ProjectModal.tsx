'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Briefcase, Building2, Calendar, Check, Globe, Hash, MapPin, User } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import { ProjectSummary } from '@/types';
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

interface ProvinceOption {
    value: string;
    label: string;
}

// Countries that have a province dropdown
const KNOWN_COUNTRY_CODES = ['USA', 'CA'] as const;
type KnownCountryCode = typeof KNOWN_COUNTRY_CODES[number];

const COUNTRY_OPTIONS = [
    { value: '',      label: 'Select country...' },
    { value: 'USA',   label: 'USA' },
    { value: 'CA',    label: 'CA' },
    { value: 'Other', label: 'Other' },
];

function isKnownCountry(code: string): code is KnownCountryCode {
    return KNOWN_COUNTRY_CODES.includes(code as KnownCountryCode);
}

/** Detect the dropdown value + custom text from a stored country string */
function parseStoredCountry(stored: string | undefined): {
    countryDropdown: string;
    customCountry: string;
} {
    if (!stored) return { countryDropdown: '', customCountry: '' };
    if (isKnownCountry(stored)) return { countryDropdown: stored, customCountry: '' };
    return { countryDropdown: 'Other', customCountry: stored };
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
        // country dropdown selection: 'USA' | 'CA' | 'Other' | ''
        countryDropdown: '',
        // free-text country name when 'Other' is selected
        customCountry: '',
        province: '',
    });

    const [provinceOptions, setProvinceOptions] = useState<ProvinceOption[]>([]);
    const [loadingProvinces, setLoadingProvinces] = useState(false);
    const provinceCacheRef = useRef<Record<string, ProvinceOption[]>>({});

    const toast = useToast();

    // ── Fetch provinces whenever the known-country dropdown changes ──────────
    const fetchProvinces = useCallback(async (countryCode: KnownCountryCode) => {
        const cacheKey = countryCode;
        const cached = provinceCacheRef.current[cacheKey];
        if (cached && cached.length > 0) {
            setProvinceOptions(cached);
            setLoadingProvinces(false);
            return;
        }

        setLoadingProvinces(true);
        setProvinceOptions([]);
        try {
            const res = await fetch(`/api/locations?country=${countryCode}`);
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
                const options: ProvinceOption[] = [
                    { value: '', label: 'Select province...' },
                    ...json.data.map((p: { code: string; name: string }) => ({
                        value: p.name,
                        label: p.name,
                    })),
                ];
                provinceCacheRef.current[cacheKey] = options;
                setProvinceOptions(options);
            }
        } catch {
            // Silently fail — user can still type province manually
        } finally {
            setLoadingProvinces(false);
        }
    }, []);

    useEffect(() => {
        if (isKnownCountry(formData.countryDropdown)) {
            fetchProvinces(formData.countryDropdown);
        } else {
            setProvinceOptions([]);
        }
    }, [formData.countryDropdown, fetchProvinces]);

    // ── Populate form when editing or resetting ──────────────────────────────
    useEffect(() => {
        if (projectToEdit) {
            const assignedMember = teamMembers.find(t => t.name === projectToEdit.assignedTo);
            const { countryDropdown, customCountry } = parseStoredCountry(projectToEdit.country);
            setFormData({
                name: projectToEdit.name,
                company: projectToEdit.company,
                projectNumber: projectToEdit.projectNumber,
                dueDate: projectToEdit.dueDate ? formatDateForInput(projectToEdit.dueDate) : '',
                status: projectToEdit.status,
                assignedTo: assignedMember?.id || '',
                countryDropdown,
                customCountry,
                province: projectToEdit.province || '',
            });
        } else {
            setFormData({
                name: '',
                company: '',
                projectNumber: '',
                dueDate: '',
                status: 'Working Project Progress',
                assignedTo: teamMembers.length > 0 ? teamMembers[0].id : '',
                countryDropdown: '',
                customCountry: '',
                province: '',
            });
        }
    }, [projectToEdit, isOpen, teamMembers]);

    // ── Date helpers ─────────────────────────────────────────────────────────
    const formatDateForInput = (dateStr: string): string => {
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return '';
            return date.toISOString().split('T')[0];
        } catch {
            return '';
        }
    };

    const formatDateForDisplay = (dateStr: string): string => {
        if (!dateStr) return '';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
        } catch {
            return dateStr;
        }
    };

    // ── Resolve the actual country value to store ────────────────────────────
    const resolvedCountry = (): string => {
        if (formData.countryDropdown === 'Other') return formData.customCountry.trim();
        return formData.countryDropdown;
    };

    // ── Validation ────────────────────────────────────────────────────────────
    const validateForm = (): boolean => {
        const missing: string[] = [];

        if (!formData.name.trim())         missing.push('Project Name');
        if (!formData.company.trim())       missing.push('Client / Company');
        if (!formData.countryDropdown)      missing.push('Project Location');
        if (formData.countryDropdown === 'Other' && !formData.customCountry.trim())
                                            missing.push('Project Location');
        if (!formData.province.trim())      missing.push('Project Province');
        if (!formData.dueDate)              missing.push('Due Date');
        if (!formData.assignedTo)           missing.push('Assign To');
        if (!formData.status)               missing.push('Status');

        if (missing.length > 0) {
            const msg = missing.length === 1
                ? `Please fill in ${missing[0]}`
                : `Please fill in: ${missing.join(', ')}`;
            toast.error(missing.length === 1 ? 'Required Field Missing' : 'Required Fields Missing', msg);
            return false;
        }
        return true;
    };

    // ── Submit ────────────────────────────────────────────────────────────────
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
            country: resolvedCountry(),
            province: formData.province.trim(),
        };

        onSubmit(projectData);
        onClose();
    };

    // ── Country change handler (resets province) ──────────────────────────────
    const handleCountryChange = (val: string) => {
        setFormData(prev => ({ ...prev, countryDropdown: val, customCountry: '', province: '' }));
    };

    const isEditMode = !!projectToEdit;
    const isOther = formData.countryDropdown === 'Other';
    const showProvinceDropdown = isKnownCountry(formData.countryDropdown) && provinceOptions.length > 0;

    const teamMemberOptions = [
        { value: '', label: 'Select a team member...' },
        ...teamMembers.map(m => ({ value: m.id, label: `${m.name} (${m.role})` })),
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

                    {/* Project Name */}
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

                    {/* Company */}
                    <FormField
                        label="Client / Company"
                        icon={Building2}
                        type="text"
                        required
                        placeholder="e.g. Apex Construction"
                        value={formData.company}
                        onChange={e => setFormData({ ...formData, company: e.target.value })}
                    />

                    {/* Country + Province row */}
                    <div className="grid grid-cols-2 gap-4">
                        {/* Project Location (country) */}
                        {isOther ? (
                            <FormField
                                label="Project Location"
                                icon={Globe}
                                type="text"
                                required
                                placeholder="Enter country name"
                                value={formData.customCountry}
                                onChange={e => setFormData({ ...formData, customCountry: e.target.value })}
                            />
                        ) : (
                            <SelectField
                                label="Project Location"
                                icon={Globe}
                                required
                                value={formData.countryDropdown}
                                onValueChange={handleCountryChange}
                                options={COUNTRY_OPTIONS}
                                placeholder="Select country..."
                            />
                        )}

                        {/* Project Province */}
                        {isOther || !formData.countryDropdown ? (
                            <FormField
                                label="Project Province"
                                icon={MapPin}
                                type="text"
                                required
                                placeholder="Enter province or state"
                                value={formData.province}
                                onChange={e => setFormData({ ...formData, province: e.target.value })}
                            />
                        ) : (
                            <SelectField
                                label="Project Province"
                                icon={MapPin}
                                required
                                value={formData.province}
                                onValueChange={val => setFormData({ ...formData, province: val })}
                                options={
                                    loadingProvinces
                                        ? [{ value: '', label: 'Loading...' }]
                                        : showProvinceDropdown
                                            ? provinceOptions
                                            : [{ value: '', label: 'Select country first...' }]
                                }
                                placeholder={formData.countryDropdown === 'USA' ? 'Select state...' : 'Select province...'}
                            />
                        )}
                    </div>

                    {/* "Other" country — show a small link back to dropdown */}
                    {isOther && (
                        <button
                            type="button"
                            className="text-xs text-emerald-600 hover:text-emerald-700 underline -mt-2"
                            onClick={() => setFormData(prev => ({ ...prev, countryDropdown: '', customCountry: '', province: '' }))}
                        >
                            ← Back to country list
                        </button>
                    )}

                    {/* Project # + Due Date */}
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

                    {/* Assign To */}
                    <SelectField
                        label="Assign To"
                        icon={User}
                        required
                        value={formData.assignedTo}
                        onValueChange={val => setFormData({ ...formData, assignedTo: val })}
                        options={teamMemberOptions}
                        placeholder="Select a team member..."
                    />

                    {/* Status */}
                    <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                            Status<span className="text-red-500 ml-1">*</span>
                        </label>
                        <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg gap-1">
                            {[
                                { value: 'Working Project Progress', label: 'In Progress' },
                                { value: 'Under Review',             label: 'Review' },
                                { value: 'Submitted',                label: 'Submitted' },
                                { value: 'Hold',                     label: 'Hold' },
                                { value: 'Archive',                  label: 'Archive' },
                            ].map(option => (
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
                    <Button type="button" variant="secondary" onClick={onClose} fullWidth>
                        Cancel
                    </Button>
                    <Button type="submit" variant="primary" icon={Check} fullWidth>
                        {isEditMode ? 'Save Changes' : 'Create Project'}
                    </Button>
                </ModalFooter>
            </form>
        </Modal>
    );
};
