'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  Archive, ArrowUpRight, Briefcase, CheckCircle2, Clock,
  Edit2, Grid, List as ListIcon, MapPin, PauseCircle,
  Plus, Search, Trash2, User, Calendar, Loader2,
} from 'lucide-react';
import { ProjectSummary } from '@/types';
import { PROJECT_STATUSES } from '@/constants';
import { getStatusColor } from '@/lib/utils/projectUtils';
import { ProjectModal } from '@/components/features/project/ProjectModal';
import { Button, ConfirmModal, Select, useToast } from '@/components/ui';
import { Input } from '@/components/shadcn/input';
import { Skeleton } from '@/components/shadcn/skeleton';
import {
  Select as ShadSelect,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/shadcn/select';
import { cn } from '@/lib/cn';

interface DashboardProps {
  onOpenProject: (project?: ProjectSummary) => void;
}

interface TeamMemberDropdownItem {
  id: string;
  name: string;
  role: string;
}

const STATUS_CONFIG = [
  {
    label: 'Working Project Progress' as const,
    shortLabel: 'In Progress',
    icon: Briefcase,
    activeCls: 'bg-emerald-600 text-white',
    inactiveCls: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    sectionIcon: 'text-emerald-600',
  },
  {
    label: 'Under Review' as const,
    shortLabel: 'Under Review',
    icon: Clock,
    activeCls: 'bg-amber-500 text-white',
    inactiveCls: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    sectionIcon: 'text-amber-600',
  },
  {
    label: 'Submitted' as const,
    shortLabel: 'Submitted',
    icon: CheckCircle2,
    activeCls: 'bg-blue-600 text-white',
    inactiveCls: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    sectionIcon: 'text-blue-600',
  },
  {
    label: 'Hold' as const,
    shortLabel: 'On Hold',
    icon: PauseCircle,
    activeCls: 'bg-slate-600 text-white',
    inactiveCls: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    sectionIcon: 'text-slate-500',
  },
  {
    label: 'Archive' as const,
    shortLabel: 'Archive',
    icon: Archive,
    activeCls: 'bg-purple-600 text-white',
    inactiveCls: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
    sectionIcon: 'text-purple-600',
  },
] as const;

// ─── Compact Project Card ─────────────────────────────────────────────────────

const ProjectCard: React.FC<{
  project: ProjectSummary;
  teamMembers: TeamMemberDropdownItem[];
  onOpen: (p: ProjectSummary) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onUpdate: (updated: ProjectSummary) => void;
}> = ({ project, teamMembers, onOpen, onEdit, onDelete, onUpdate }) => {
  const [isEditingStatus, setIsEditingStatus] = useState(false);
  const [isEditingAssignee, setIsEditingAssignee] = useState(false);

  const statusShort = project.status === 'Working Project Progress' ? 'In Progress' : project.status;

  return (
    <div
      onClick={() => onOpen(project)}
      className="group bg-white border border-slate-200 rounded-lg p-3.5 hover:border-emerald-400 hover:shadow-md transition-all cursor-pointer"
    >
      {/* Name + status badge */}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3 className="font-semibold text-sm text-slate-900 leading-snug line-clamp-2 group-hover:text-emerald-700 flex-1 min-w-0">
          {project.name}
        </h3>
        {isEditingStatus ? (
          <div onClick={e => e.stopPropagation()} className="shrink-0">
            <Select
              autoFocus
              containerClassName="w-auto"
              options={PROJECT_STATUSES.map(s => ({ value: s, label: s }))}
              size="xs"
              value={project.status}
              onValueChange={v => {
                onUpdate({ ...project, status: v as ProjectSummary['status'] });
                setIsEditingStatus(false);
              }}
              onClose={() => setIsEditingStatus(false)}
              variant="filter"
              aria-label="Project status"
            />
          </div>
        ) : (
          <span
            onDoubleClick={e => { e.stopPropagation(); setIsEditingStatus(true); }}
            title="Double-click to change status"
            className={cn(
              'shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer select-none whitespace-nowrap',
              getStatusColor(project.status),
            )}
          >
            {statusShort}
          </span>
        )}
      </div>

      {/* Company */}
      <p className="text-xs text-slate-500 mb-3 line-clamp-1">{project.company || '—'}</p>

      {/* Date + assignee */}
      <div className="flex items-center gap-3 text-[11px] text-slate-400 mb-3">
        <span className="flex items-center gap-1 shrink-0">
          <Calendar className="w-3 h-3" />
          {project.dueDate || '—'}
        </span>
        <span className="flex items-center gap-1 min-w-0 flex-1 truncate">
          <User className="w-3 h-3 shrink-0" />
          {isEditingAssignee ? (
            <div onClick={e => e.stopPropagation()} className="flex-1">
              <Select
                autoFocus
                containerClassName="w-full"
                options={[
                  { value: '', label: 'Unassigned' },
                  ...teamMembers.map(m => ({ value: m.id, label: m.name })),
                ]}
                size="xs"
                value={teamMembers.find(m => m.name === project.assignedTo)?.id || ''}
                onValueChange={v => {
                  const member = teamMembers.find(m => m.id === v);
                  onUpdate({ ...project, assignedTo: member?.name || 'Unassigned' });
                  setIsEditingAssignee(false);
                }}
                onClose={() => setIsEditingAssignee(false)}
                variant="filter"
                aria-label="Project assignee"
              />
            </div>
          ) : (
            <span
              onDoubleClick={e => { e.stopPropagation(); setIsEditingAssignee(true); }}
              title="Double-click to reassign"
              className="truncate cursor-pointer hover:text-emerald-600 select-none"
            >
              {project.assignedTo || 'Unassigned'}
            </span>
          )}
        </span>
      </div>

      {/* Footer: project number + action buttons */}
      <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
        <code className="text-[10px] text-slate-400 font-mono">#{project.projectNumber}</code>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
          >
            <Edit2 className="w-3 h-3" />
          </button>
          <button
            onClick={onDelete}
            className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <Skeleton className="h-5 w-32 mb-1.5" />
            <Skeleton className="h-3.5 w-48" />
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-20 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-8 w-28 rounded-lg" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-64 rounded-md" />
          <Skeleton className="h-8 w-36 rounded-md" />
          <Skeleton className="h-8 w-8 rounded-md ml-auto" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {Array.from({ length: 16 }).map((_, i) => (
            <Skeleton key={i} className="h-[138px] rounded-lg" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export const Dashboard: React.FC<DashboardProps> = ({ onOpenProject }) => {
  const toast = useToast();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMemberDropdownItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isCreatingProject, setIsCreatingProject] = useState(false);

  const fetchProjects = useCallback(async () => {
    try {
      const response = await fetch('/api/projects');
      const data = await response.json();
      if (data.success) {
        setProjects(data.projects || []);
        setError(null);
      } else {
        setError(data.error || 'Failed to fetch projects');
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
      setError('Failed to fetch projects');
    }
  }, []);

  const fetchTeamMembers = useCallback(async () => {
    try {
      const response = await fetch('/api/team/dropdown');
      const data = await response.json();
      if (data.success) setTeamMembers(data.members || []);
    } catch (err) {
      console.error('Error fetching team members:', err);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchProjects(), fetchTeamMembers()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchProjects, fetchTeamMembers]);

  const filteredProjects = projects
    .filter(p => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        p.name.toLowerCase().includes(q) ||
        p.company.toLowerCase().includes(q) ||
        p.projectNumber.toLowerCase().includes(q) ||
        (p.location && p.location.toLowerCase().includes(q));
      const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
      const matchesAssignee =
        assigneeFilter === 'all' ||
        (assigneeFilter === 'unassigned' && !p.assignedTo) ||
        teamMembers.find(m => m.id === assigneeFilter)?.name === p.assignedTo;
      return matchesSearch && matchesStatus && matchesAssignee;
    })
    .sort((a, b) => {
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const handleCreateOrUpdateProject = async (projectData: ProjectSummary) => {
    setIsProjectModalOpen(false);
    try {
      if (editingProject) {
        const response = await fetch(`/api/projects/${editingProject.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: projectData.name,
            company: projectData.company,
            status: projectData.status,
            dueDate: projectData.dueDate,
            projectNumber: projectData.projectNumber,
            assignedTo: projectData.assignedTo,
            location: projectData.location,
            country: projectData.country,
            province: projectData.province,
          }),
        });
        const data = await response.json();
        if (data.success) {
          setProjects(prev => prev.map(p => p.id === editingProject.id ? data.project : p));
          toast.success('Project Updated', 'Project has been updated successfully.');
        } else {
          toast.error('Update Failed', data.error || 'Failed to update project');
        }
      } else {
        setIsCreatingProject(true);
        const response = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: projectData.name,
            company: projectData.company,
            status: projectData.status,
            dueDate: projectData.dueDate,
            projectNumber: projectData.projectNumber,
            assignedTo: projectData.assignedTo,
            location: projectData.location,
            country: projectData.country,
            province: projectData.province,
          }),
        });
        const data = await response.json();
        if (data.success) {
          setProjects(prev => [data.project, ...prev]);
          onOpenProject(data.project);
        } else {
          setIsCreatingProject(false);
          toast.error('Creation Failed', data.error || 'Failed to create project');
        }
      }
    } catch (err) {
      console.error('Error saving project:', err);
      setIsCreatingProject(false);
      toast.error('Error', 'Failed to save project. Please try again.');
    }
    setEditingProject(null);
  };

  const handleQuickUpdate = async (updated: ProjectSummary) => {
    try {
      const response = await fetch(`/api/projects/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: updated.status, assignedTo: updated.assignedTo }),
      });
      const data = await response.json();
      if (data.success) setProjects(prev => prev.map(p => p.id === updated.id ? data.project : p));
    } catch (err) {
      console.error('Error updating project:', err);
    }
  };

  const openEditModal = (e: React.MouseEvent, project: ProjectSummary) => {
    e.stopPropagation();
    setEditingProject(project);
    setIsProjectModalOpen(true);
  };

  const openDeleteModal = (e: React.MouseEvent, project: ProjectSummary) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setIsDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!projectToDelete) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/projects/${projectToDelete.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        setProjects(prev => prev.filter(p => p.id !== projectToDelete.id));
        toast.success('Project Deleted', `"${projectToDelete.name}" has been deleted.`);
      } else {
        toast.error('Delete Failed', data.error || 'Failed to delete project');
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      toast.error('Error', 'Failed to delete project. Please try again.');
    } finally {
      setIsDeleting(false);
      setIsDeleteModalOpen(false);
      setProjectToDelete(null);
    }
  };

  const statusCounts = {
    'Working Project Progress': projects.filter(p => p.status === 'Working Project Progress').length,
    'Under Review': projects.filter(p => p.status === 'Under Review').length,
    'Submitted': projects.filter(p => p.status === 'Submitted').length,
    'Hold': projects.filter(p => p.status === 'Hold').length,
    'Archive': projects.filter(p => p.status === 'Archive').length,
  };

  const assigneeOptions = [
    { value: 'all', label: 'All Members' },
    ...teamMembers.map(m => ({ value: m.id, label: m.name })),
    { value: 'unassigned', label: 'Unassigned' },
  ];

  if (isLoading) return <DashboardSkeleton />;

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center max-w-sm">
          <p className="text-red-600 text-sm mb-3">{error}</p>
          <button
            onClick={() => { setError(null); fetchProjects(); }}
            className="text-xs text-red-700 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Sticky header ───────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-slate-200 bg-white shrink-0">

        {/* Row 1: title | status pills | new project */}
        <div className="flex items-center gap-4 mb-3">
          <div className="shrink-0">
            <h1 className="text-lg font-bold text-slate-900">Projects</h1>
            <p className="text-xs text-slate-500 mt-0.5">{projects.length} total</p>
          </div>

          {/* Status filter pills */}
          <div className="flex items-center gap-1.5 flex-1 flex-wrap">
            <button
              onClick={() => setStatusFilter('All')}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                statusFilter === 'All'
                  ? 'bg-slate-800 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
              )}
            >
              All
              <span className="text-[10px] font-bold opacity-70">{projects.length}</span>
            </button>
            {STATUS_CONFIG.map(item => {
              const count = statusCounts[item.label];
              const isActive = statusFilter === item.label;
              return (
                <button
                  key={item.label}
                  onClick={() => setStatusFilter(isActive ? 'All' : item.label)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors',
                    isActive ? item.activeCls : item.inactiveCls,
                  )}
                >
                  <item.icon className="w-3 h-3" />
                  {item.shortLabel}
                  <span className="text-[10px] font-bold opacity-70">{count}</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={() => { setEditingProject(null); setIsProjectModalOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg shrink-0 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        {/* Row 2: search | assignee filter | result count | view toggle */}
        <div className="flex items-center gap-2">
          <div className="relative max-w-xs flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <Input
              placeholder="Search name, company, number..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <ShadSelect value={assigneeFilter} onValueChange={setAssigneeFilter}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue placeholder="All Members" />
            </SelectTrigger>
            <SelectContent>
              {assigneeOptions.map(o => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </ShadSelect>

          <span className="text-xs text-slate-400 shrink-0">
            {filteredProjects.length} project{filteredProjects.length !== 1 ? 's' : ''}
          </span>

          <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-md ml-auto">
            <button
              onClick={() => setViewMode('grid')}
              className={cn('p-1.5 rounded transition-all', viewMode === 'grid' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn('p-1.5 rounded transition-all', viewMode === 'list' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700')}
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">

        {/* Empty: no projects at all */}
        {projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <Briefcase className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">No projects yet</h3>
            <p className="text-sm text-slate-500 mb-6">Get started by creating your first project.</p>
            <button
              onClick={() => { setEditingProject(null); setIsProjectModalOpen(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Project
            </button>
          </div>
        )}

        {/* Empty: filters match nothing */}
        {projects.length > 0 && filteredProjects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 border-2 border-dashed border-slate-200 rounded-xl">
            <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mb-4">
              <Search className="w-7 h-7 text-amber-400" />
            </div>
            <h3 className="text-base font-semibold text-slate-700 mb-1">No results found</h3>
            <p className="text-sm text-slate-500 mb-6 text-center max-w-xs">
              {statusFilter !== 'All'
                ? `No projects with "${statusFilter}" status.`
                : searchQuery
                  ? `Nothing matches "${searchQuery}".`
                  : 'No projects match the current filters.'}
            </p>
            <button
              onClick={() => { setStatusFilter('All'); setSearchQuery(''); setAssigneeFilter('all'); }}
              className="px-3 py-1.5 text-sm font-medium border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Clear filters
            </button>
          </div>
        )}

        {/* ── Grid view ─────────────────────────────────────────────────────── */}
        {viewMode === 'grid' && filteredProjects.length > 0 && (
          <div className="space-y-8">
            {STATUS_CONFIG.map(cfg => {
              const sectionProjects = filteredProjects.filter(p => p.status === cfg.label);
              if (sectionProjects.length === 0) return null;
              return (
                <div key={cfg.label}>
                  {/* Section header */}
                  <div className="flex items-center gap-2 mb-3">
                    <cfg.icon className={cn('w-4 h-4', cfg.sectionIcon)} />
                    <h2 className="text-sm font-semibold text-slate-700">
                      {cfg.label === 'Working Project Progress' ? 'In Progress' : cfg.label}
                    </h2>
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full">
                      {sectionProjects.length}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {sectionProjects.map(project => (
                      <ProjectCard
                        key={project.id}
                        project={project}
                        teamMembers={teamMembers}
                        onOpen={onOpenProject}
                        onEdit={e => openEditModal(e, project)}
                        onDelete={e => openDeleteModal(e, project)}
                        onUpdate={handleQuickUpdate}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── List view ─────────────────────────────────────────────────────── */}
        {viewMode === 'list' && filteredProjects.length > 0 && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Client</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Location</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assigned</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Due</th>
                  <th className="px-4 py-3 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProjects.map(project => (
                  <tr
                    key={project.id}
                    onClick={() => onOpenProject(project)}
                    className="hover:bg-slate-50 cursor-pointer transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900 text-sm leading-snug">{project.name}</div>
                      <code className="text-[10px] text-slate-400 font-mono">#{project.projectNumber}</code>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{project.company || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        {project.location && <MapPin className="w-3 h-3 text-slate-400 shrink-0" />}
                        {project.location || '—'}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', getStatusColor(project.status))}>
                        {project.status === 'Working Project Progress' ? 'In Progress' : project.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        {project.assignedTo || 'Unassigned'}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500 tabular-nums">{project.dueDate || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => openEditModal(e, project)}
                          className="p-1.5 rounded text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={e => openDeleteModal(e, project)}
                          className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────────────────────────── */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => { setIsProjectModalOpen(false); setEditingProject(null); }}
        onSubmit={handleCreateOrUpdateProject}
        projectToEdit={editingProject}
        teamMembers={teamMembers}
      />

      <ConfirmModal
        isOpen={isDeleteModalOpen}
        onClose={() => { setIsDeleteModalOpen(false); setProjectToDelete(null); }}
        onConfirm={confirmDelete}
        title="Delete Project"
        message={`Are you sure you want to delete "${projectToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={isDeleting}
      />

      {isCreatingProject && (
        <div className="fixed inset-0 z-[9999] bg-white/90 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <Loader2 className="w-7 h-7 text-emerald-600 animate-spin" />
            </div>
            <div className="text-center">
              <h3 className="text-base font-semibold text-slate-900 mb-1">Creating Project</h3>
              <p className="text-sm text-slate-500">Setting up your new project...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
