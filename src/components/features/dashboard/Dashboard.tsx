'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ArrowUpRight, Briefcase, Check, Edit2, Grid, Hash, List as ListIcon, MapPin, Plus, Search, Trash2, User, Calendar, Loader2 } from 'lucide-react';
import { ProjectSummary } from '@/types';
import { PROJECT_STATUSES } from '@/constants';
import { getStatusColor } from '@/lib/utils/projectUtils';
import { ProjectModal } from '@/components/features/project/ProjectModal';
import { Button, IconButton, SearchInput, FilterSelect, ConfirmModal, useToast } from '@/components/ui';

interface DashboardProps {
  onOpenProject: (project?: ProjectSummary) => void;
}

interface TeamMemberDropdownItem {
  id: string;
  name: string;
  role: string;
}

// --- Inline ProjectCard Component ---
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

  return (
    <div
      onClick={() => onOpen(project)}
      className="group bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-500 hover:shadow-md transition-all cursor-pointer relative animate-in fade-in duration-300"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="flex-1">
          <h3 className="font-bold text-lg text-slate-900 leading-tight mb-1 group-hover:text-blue-700 transition-colors line-clamp-1">{project.name}</h3>
          <p className="text-sm font-medium text-slate-500 line-clamp-1">{project.company}</p>
        </div>

        {isEditingStatus ? (
          <div onClick={e => e.stopPropagation()}>
            <select
              autoFocus
              className="text-xs border border-blue-300 rounded px-1 py-0.5 outline-none"
              value={project.status}
              onChange={(e) => {
                onUpdate({ ...project, status: e.target.value as ProjectSummary['status'] });
                setIsEditingStatus(false);
              }}
              onBlur={() => setIsEditingStatus(false)}
            >
              {PROJECT_STATUSES.map(status => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </div>
        ) : (
          <span
            onDoubleClick={(e) => { e.stopPropagation(); setIsEditingStatus(true); }}
            title="Double click to change status"
            className={`px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer select-none ${getStatusColor(project.status)}`}
          >
            {project.status}
          </span>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center text-sm text-slate-600 gap-2">
          <div className="w-6 flex justify-center"><Calendar className="w-4 h-4 text-emerald-500" /></div>
          <span className="font-medium">{project.dueDate || 'No due date'}</span>
        </div>

        <div className="flex items-center text-sm text-slate-600 gap-2">
          <div className="w-6 flex justify-center"><User className="w-4 h-4 text-slate-400" /></div>
          {isEditingAssignee ? (
            <div onClick={e => e.stopPropagation()} className="flex-1">
              <select
                autoFocus
                className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 outline-none"
                value={teamMembers.find(m => m.name === project.assignedTo)?.id || ''}
                onChange={(e) => {
                  const newMember = teamMembers.find(m => m.id === e.target.value);
                  onUpdate({ ...project, assignedTo: newMember?.name || 'Unassigned' });
                  setIsEditingAssignee(false);
                }}
                onBlur={() => setIsEditingAssignee(false)}
              >
                <option value="">Unassigned</option>
                {teamMembers.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <span
              onDoubleClick={(e) => { e.stopPropagation(); setIsEditingAssignee(true); }}
              title="Double click to reassign"
              className="text-slate-500 truncate cursor-pointer hover:text-emerald-600 select-none"
            >
              {project.assignedTo || 'Unassigned'}
            </span>
          )}
        </div>

        <div className="flex items-center text-sm text-slate-600 gap-2">
          <div className="w-6 flex justify-center"><ArrowUpRight className="w-4 h-4 text-slate-400" /></div>
          <span className="text-slate-500">#{project.projectNumber}</span>
        </div>
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
        <button className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 group-hover:underline">
          Open Project <ArrowUpRight className="w-4 h-4" />
        </button>
        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <IconButton
            icon={Edit2}
            onClick={onEdit}
            variant="primary"
            tooltip="Edit Project"
          />
          <IconButton
            icon={Trash2}
            onClick={onDelete}
            variant="danger"
            tooltip="Delete Project"
          />
        </div>
      </div>
    </div>
  );
};

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

  // Modal State
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);

  // Delete Confirmation State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState<ProjectSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Creating project loading state
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  // Fetch projects from API
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

  // Fetch team members from API
  const fetchTeamMembers = useCallback(async () => {
    try {
      const response = await fetch('/api/team/dropdown');
      const data = await response.json();

      if (data.success) {
        setTeamMembers(data.members || []);
      }
    } catch (err) {
      console.error('Error fetching team members:', err);
    }
  }, []);

  // Initial data fetch
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      await Promise.all([fetchProjects(), fetchTeamMembers()]);
      setIsLoading(false);
    };
    loadData();
  }, [fetchProjects, fetchTeamMembers]);

  // Filter projects for display
  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.projectNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location && p.location.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
    const matchesAssignee = assigneeFilter === 'all' ||
      (assigneeFilter === 'unassigned' && !p.assignedTo) ||
      teamMembers.find(m => m.id === assigneeFilter)?.name === p.assignedTo;
    return matchesSearch && matchesStatus && matchesAssignee;
  }).sort((a, b) => {
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
  });

  // Create or Update project
  const handleCreateOrUpdateProject = async (projectData: ProjectSummary) => {
    // Close modal first
    setIsProjectModalOpen(false);

    try {
      if (editingProject) {
        // Update existing project
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
        // Show loading overlay for new project creation
        setIsCreatingProject(true);

        // Create new project
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
          }),
        });
        const data = await response.json();

        if (data.success) {
          setProjects(prev => [data.project, ...prev]);
          // Navigate to the new project (loading overlay stays visible until navigation completes)
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

  // Quick update project (for inline status/assignee changes)
  const handleQuickUpdate = async (updated: ProjectSummary) => {
    try {
      const response = await fetch(`/api/projects/${updated.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: updated.status,
          assignedTo: updated.assignedTo,
        }),
      });
      const data = await response.json();

      if (data.success) {
        setProjects(prev => prev.map(p => p.id === updated.id ? data.project : p));
      }
    } catch (err) {
      console.error('Error updating project:', err);
    }
  };

  const openEditModal = (e: React.MouseEvent, project: ProjectSummary) => {
    e.stopPropagation();
    setEditingProject(project);
    setIsProjectModalOpen(true);
  };

  // Open delete confirmation modal
  const openDeleteModal = (e: React.MouseEvent, project: ProjectSummary) => {
    e.stopPropagation();
    setProjectToDelete(project);
    setIsDeleteModalOpen(true);
  };

  // Confirm delete action
  const confirmDelete = async () => {
    if (!projectToDelete) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/projects/${projectToDelete.id}`, {
        method: 'DELETE',
      });
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

  // Calculate status counts from ALL projects (not filtered)
  const statusCounts = {
    'Working Project Progress': projects.filter(p => p.status === 'Working Project Progress').length,
    'Under Review': projects.filter(p => p.status === 'Under Review').length,
    'Submitted': projects.filter(p => p.status === 'Submitted').length,
    'Hold': projects.filter(p => p.status === 'Hold').length,
    'Archive': projects.filter(p => p.status === 'Archive').length,
  };

  // Build assignee dropdown options
  const assigneeOptions = [
    { value: 'all', label: 'All Members' },
    ...teamMembers.map(m => ({ value: m.id, label: m.name })),
    { value: 'unassigned', label: 'Unassigned' },
  ];

  if (isLoading) {
    return (
      <div className="w-full mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
          <p className="text-slate-500">Loading projects...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => { setError(null); fetchProjects(); }}
            className="mt-2 text-sm text-red-700 underline hover:no-underline"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-6 space-y-8">

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Projects Dashboard</h1>
          <p className="text-slate-500 mt-1">Manage your estimates and proposals.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={() => { setEditingProject(null); setIsProjectModalOpen(true); }}
            variant="success"
            icon={Plus}
          >
            New Project
          </Button>
        </div>
      </div>

      {/* Chevron Status Bar - Uses ALL projects for counts */}
      <div className="flex w-full overflow-x-auto pb-2 mb-4 scrollbar-thin">
        <div className="flex w-full min-w-max bg-white rounded-lg border border-slate-200 shadow-sm divide-x divide-slate-100">
          {[
            { label: 'Working Project Progress', icon: Briefcase, color: 'text-emerald-600' },
            { label: 'Under Review', icon: Search, color: 'text-amber-600' },
            { label: 'Submitted', icon: Check, color: 'text-blue-600' },
            { label: 'Hold', icon: Hash, color: 'text-slate-600' },
            { label: 'Archive', icon: Trash2, color: 'text-purple-600' },
          ].map((item, index, arr) => {
            const isActive = statusFilter === item.label;
            const count = statusCounts[item.label as keyof typeof statusCounts];
            return (
              <button
                key={item.label}
                onClick={() => setStatusFilter(isActive ? 'All' : item.label)}
                className={`flex-1 flex items-center px-4 py-3 gap-3 group transition-all relative text-left
                ${isActive ? 'bg-emerald-50/50 shadow-inner' : 'hover:bg-slate-50'}
              `}
              >
                <div className={`p-2 rounded-lg transition-all ${isActive ? 'bg-white shadow-sm ring-2 ring-emerald-500/20' : 'bg-slate-50 border border-slate-100 group-hover:bg-white group-hover:shadow-sm'} ${item.color}`}>
                  <item.icon className="w-4 h-4" />
                </div>
                <div>
                  <div className={`text-xs font-medium uppercase tracking-wide mb-0.5 ${isActive ? 'text-emerald-700' : 'text-slate-400'}`}>{item.label}</div>
                  <div className={`text-lg font-bold ${isActive ? 'text-emerald-900' : 'text-slate-800'}`}>{count}</div>
                </div>
                {index !== arr.length - 1 && (
                  <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 w-6 h-6 bg-white rotate-45 border-t border-r border-slate-200 hidden md:block"></div>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filters & Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4 justify-between items-center">
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full lg:w-auto">
          <div className="w-full sm:w-64">
            <SearchInput
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder="Search projects..."
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <FilterSelect
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              options={[
                { value: 'All', label: 'All Status' },
                ...PROJECT_STATUSES.map(status => ({ value: status, label: status }))
              ]}
            />

            <FilterSelect
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              options={assigneeOptions}
              showIcon={false}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg">
          <button
            onClick={() => setViewMode('grid')}
            className={`p-1.5 rounded-md transition-all ${viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Grid className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <ListIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Empty State - No projects at all */}
      {projects.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-slate-100 flex items-center justify-center">
            <Briefcase className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-700 mb-2">No projects yet</h3>
          <p className="text-slate-500 mb-6">Get started by creating your first project.</p>
          <Button
            onClick={() => { setEditingProject(null); setIsProjectModalOpen(true); }}
            variant="success"
            icon={Plus}
          >
            Create Project
          </Button>
        </div>
      )}

      {/* Empty State - No projects match current filters */}
      {projects.length > 0 && filteredProjects.length === 0 && (
        <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed border-slate-200">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-amber-50 flex items-center justify-center">
            <Search className="w-10 h-10 text-amber-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-800 mb-3">No projects found</h3>
          <p className="text-slate-500 mb-8 max-w-md mx-auto px-4">
            {statusFilter !== 'All'
              ? `There are no projects with "${statusFilter}" status.`
              : searchQuery
                ? `No projects match your search "${searchQuery}".`
                : 'No projects match your current filters.'}
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button
              onClick={() => { setStatusFilter('All'); setSearchQuery(''); setAssigneeFilter('all'); }}
              variant="secondary"
            >
              Clear Filters
            </Button>
            <Button
              onClick={() => { setEditingProject(null); setIsProjectModalOpen(true); }}
              variant="success"
              icon={Plus}
            >
              New Project
            </Button>
          </div>
        </div>
      )}

      {/* Projects Grid View (Grouped) */}
      {viewMode === 'grid' && filteredProjects.length > 0 && (
        <div className="space-y-10">
          {[
            { title: 'Working Project Progress', statuses: ['Working Project Progress'], icon: <Briefcase className="w-5 h-5 text-blue-600" /> },
            { title: 'Under Review', statuses: ['Under Review'], icon: <Search className="w-5 h-5 text-amber-600" /> },
            { title: 'Submitted', statuses: ['Submitted'], icon: <Check className="w-5 h-5 text-blue-600" /> },
            { title: 'Hold', statuses: ['Hold'], icon: <Hash className="w-5 h-5 text-slate-500" /> },
            { title: 'Archive', statuses: ['Archive'], icon: <Trash2 className="w-5 h-5 text-purple-600" /> }
          ].map((section) => {
            const sectionProjects = filteredProjects.filter(p => section.statuses.includes(p.status));
            if (sectionProjects.length === 0 && statusFilter !== 'All') return null;

            return (
              <div key={section.title}>
                <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
                  {section.icon}
                  <h2 className="text-lg font-bold text-slate-800">{section.title}</h2>
                  <span className="bg-slate-100 text-slate-600 text-xs font-bold px-2 py-0.5 rounded-full">{sectionProjects.length}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sectionProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      teamMembers={teamMembers}
                      onOpen={onOpenProject}
                      onEdit={(e) => openEditModal(e, project)}
                      onDelete={(e) => openDeleteModal(e, project)}
                      onUpdate={handleQuickUpdate}
                    />
                  ))}
                  {sectionProjects.length === 0 && (
                    <div className="col-span-full py-8 text-center text-slate-400 text-sm border-2 border-dashed border-slate-100 rounded-xl bg-slate-50/50">
                      No projects in {section.title}
                    </div>
                  )}
                </div>
              </div>
            );
          })
          }
        </div>
      )}

      {/* Projects List View */}
      {viewMode === 'list' && filteredProjects.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-6 py-4 font-semibold text-slate-700">Project Name</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Client</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Location</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Status</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Assigned To</th>
                <th className="px-6 py-4 font-semibold text-slate-700">Due Date</th>
                <th className="px-6 py-4 font-semibold text-slate-700 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProjects.map((project) => (
                <tr
                  key={project.id}
                  onClick={() => onOpenProject(project)}
                  className="hover:bg-slate-50 cursor-pointer transition-colors group"
                >
                  <td className="px-6 py-4 font-medium text-slate-900">
                    {project.name}
                    <div className="text-xs text-slate-400 font-normal mt-0.5">#{project.projectNumber}</div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{project.company}</td>
                  <td className="px-6 py-4 text-slate-600">
                    <div className="flex items-center gap-1.5">
                      {project.location && <MapPin className="w-3.5 h-3.5 text-slate-400" />}
                      {project.location || '-'}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getStatusColor(project.status)}`}>
                      {project.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-600">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      {project.assignedTo || 'Unassigned'}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-600">{project.dueDate || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <IconButton
                        icon={Edit2}
                        onClick={(e) => openEditModal(e, project)}
                        variant="success"
                        tooltip="Edit Project"
                      />
                      <IconButton
                        icon={Trash2}
                        onClick={(e) => openDeleteModal(e, project)}
                        variant="danger"
                        tooltip="Delete Project"
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Project Create/Edit Modal */}
      <ProjectModal
        isOpen={isProjectModalOpen}
        onClose={() => { setIsProjectModalOpen(false); setEditingProject(null); }}
        onSubmit={handleCreateOrUpdateProject}
        projectToEdit={editingProject}
        teamMembers={teamMembers}
      />

      {/* Delete Confirmation Modal */}
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

      {/* Creating Project Loading Overlay */}
      {isCreatingProject && (
        <div className="fixed inset-0 z-[9999] bg-white/90 backdrop-blur-sm flex items-center justify-center">
          <div className="flex flex-col items-center gap-4 p-8 rounded-2xl bg-white shadow-xl border border-slate-200">
            <div className="relative">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <h3 className="text-lg font-semibold text-slate-900 mb-1">Creating Project</h3>
              <p className="text-sm text-slate-500">Setting up your new project...</p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
