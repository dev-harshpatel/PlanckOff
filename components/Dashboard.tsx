
import React, { useState } from 'react';
import { ArrowUpRight, Briefcase, Check, Edit2, Grid, Hash, List as ListIcon, MapPin, Plus, Search, Trash2, User, Calendar } from 'lucide-react';
import { ProjectSummary } from '../types';
import { PROJECT_STATUSES, TEAM_MEMBERS } from '../constants';
import { getStatusColor } from '../utils/projectUtils';
import { ProjectModal } from './ProjectModal';
import { Button, IconButton, SearchInput, StatusBadge, FilterSelect } from './common';

interface DashboardProps {
  onOpenProject: (project?: ProjectSummary) => void;
}

// --- Inline ProjectCard Component (To be extracted to components/project/ProjectCard.tsx) ---
const ProjectCard: React.FC<{
  project: ProjectSummary;
  onOpen: (p: ProjectSummary) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  onUpdate: (updated: ProjectSummary) => void;
}> = ({ project, onOpen, onEdit, onDelete, onUpdate }) => {
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
                onUpdate({ ...project, status: e.target.value as any });
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
          <span className="font-medium">{project.dueDate}</span>
        </div>

        <div className="flex items-center text-sm text-slate-600 gap-2">
          <div className="w-6 flex justify-center"><User className="w-4 h-4 text-slate-400" /></div>
          {isEditingAssignee ? (
            <div onClick={e => e.stopPropagation()} className="flex-1">
              <select
                autoFocus
                className="w-full text-xs border border-blue-300 rounded px-1 py-0.5 outline-none"
                value={TEAM_MEMBERS.find(m => m.name === project.assignedTo)?.id || 'u1'}
                onChange={(e) => {
                  const newMember = TEAM_MEMBERS.find(m => m.id === e.target.value);
                  if (newMember) {
                    onUpdate({ ...project, assignedTo: newMember.name });
                  }
                  setIsEditingAssignee(false);
                }}
                onBlur={() => setIsEditingAssignee(false)}
              >
                {TEAM_MEMBERS.filter(m => m.id !== 'all').map(m => (
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

const INITIAL_PROJECTS: ProjectSummary[] = [
  {
    id: 'p1',
    name: 'Downtown Office Tower',
    company: 'Major Corp',
    status: 'Working Project Progress',
    dueDate: '27 Nov 2025',
    projectNumber: '2023-001',
    assignedTo: 'Demo User (Me)',
    location: 'New York, NY'
  },
  {
    id: 'p2',
    name: 'Suburban Retail Center',
    company: 'Retail Giant',
    status: 'Hold',
    dueDate: '7 Dec 2025',
    projectNumber: '2023-002',
    assignedTo: 'Sarah Jenkins',
    location: 'Austin, TX'
  }
];

// TEAM_MEMBERS now imported from constants

export const Dashboard: React.FC<DashboardProps> = ({ onOpenProject }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [projects, setProjects] = useState<ProjectSummary[]>(INITIAL_PROJECTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');

  // Modal State
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectSummary | null>(null);

  const filteredProjects = projects.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.projectNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.location && p.location.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
    const matchesAssignee = assigneeFilter === 'all' ||
      (assigneeFilter === 'u1' && p.assignedTo === 'Demo User (Me)') ||
      (assigneeFilter === 'u2' && p.assignedTo === 'Sarah Jenkins') ||
      (assigneeFilter === 'u3' && p.assignedTo === 'Mike Ross') ||
      (!p.assignedTo && assigneeFilter === 'unassigned');
    return matchesSearch && matchesStatus && matchesAssignee;
  }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  const handleCreateOrUpdateProject = (projectData: ProjectSummary) => {
    if (editingProject) {
      // Update existing
      setProjects(prev => prev.map(p => p.id === editingProject.id ? projectData : p));
      setEditingProject(null);
    } else {
      // Create new
      setProjects(prev => [projectData, ...prev]);
      onOpenProject(projectData); // Auto-open new projects? Optional.
    }
    setIsProjectModalOpen(false);
  };

  const openEditModal = (e: React.MouseEvent, project: ProjectSummary) => {
    e.stopPropagation();
    setEditingProject(project);
    setIsProjectModalOpen(true);
  };

  const handleDelete = (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project?')) {
      setProjects(prev => prev.filter(p => p.id !== projectId));
    }
  };

  // getStatusColor now imported from utils/projectUtils

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

      {/* Chevron Status Bar */}
      <div className="flex w-full overflow-x-auto pb-2 mb-4 scrollbar-thin">
        <div className="flex w-full min-w-max bg-white rounded-lg border border-slate-200 shadow-sm divide-x divide-slate-100">
          {[
            { label: 'Working Project Progress', icon: Briefcase, color: 'text-emerald-600', count: filteredProjects.filter(p => p.status === 'Working Project Progress').length },
            { label: 'Under Review', icon: Search, color: 'text-amber-600', count: filteredProjects.filter(p => p.status === 'Under Review').length },
            { label: 'Submitted', icon: Check, color: 'text-blue-600', count: filteredProjects.filter(p => p.status === 'Submitted').length },
            { label: 'Hold', icon: Hash, color: 'text-slate-600', count: filteredProjects.filter(p => p.status === 'Hold').length },
            { label: 'Archive', icon: Trash2, color: 'text-purple-600', count: filteredProjects.filter(p => p.status === 'Archive').length },
          ].map((item, index, arr) => {
            const isActive = statusFilter === item.label;
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
                  <div className={`text-lg font-bold ${isActive ? 'text-emerald-900' : 'text-slate-800'}`}>{item.count}</div>
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
              options={TEAM_MEMBERS.map(m => ({ value: m.id, label: m.name }))}
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

      {/* Projects Grid View (Grouped) */}
      {viewMode === 'grid' && (
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
                      onOpen={onOpenProject}
                      onEdit={(e) => openEditModal(e, project)}
                      onDelete={(e) => handleDelete(e, project.id)}
                      onUpdate={(updated) => handleCreateOrUpdateProject(updated)}
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
      {viewMode === 'list' && (
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
                  <td className="px-6 py-4 text-slate-600">{project.dueDate}</td>
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
                        onClick={(e) => handleDelete(e, project.id)}
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
      />

    </div>
  );
};
