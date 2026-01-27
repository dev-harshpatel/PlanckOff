'use client';

import React, { useState, useEffect } from 'react';
import { AlertCircle, ArrowLeftRight, Box, Briefcase, Database, FileText, Info, LayoutDashboard, LayoutTemplate, LogOut, Percent, Settings, Users as UsersIcon, Building2 } from 'lucide-react';
import { AppState, ProjectSummary, WallAssembly } from '@/types';
import { Dashboard } from '@/components/dashboard/Dashboard';
import { DatabaseManager } from '@/components/database/DatabaseManager';
import { DefaultAssembliesManager } from '@/components/assemblies/DefaultAssembliesManager';
import { EstimateResult } from '@/components/project/EstimateResult';
import { SettingsModal } from '@/components/settings/SettingsModal';
import { TeamManagement } from '@/components/team/TeamManagement';
import { identifyWallAssemblies } from '@/lib/gemini/client';
import { AppProvider, useApp } from '@/context/AppContext';

const AppContent: React.FC = () => {
  const { materials, setMaterials, rolePermissions, setRolePermissions, defaultAssemblies, setDefaultAssemblies, appSettings, setAppSettings } = useApp();

  const [view, setView] = useState<'dashboard' | 'team' | 'database' | 'project' | 'defaultAssemblies'>('dashboard');
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [assemblies, setAssemblies] = useState<WallAssembly[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ProjectSummary | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState<'proposal' | 'bidding' | 'markups' | 'materials' | 'labor'>('proposal');
  const [displayUnit, setDisplayUnit] = useState<'imperial' | 'metric'>('imperial');
  const [showSettings, setShowSettings] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.src = '/logo.jpg';
    img.onload = () => setLogoLoaded(true);
    img.onerror = () => setLogoLoaded(false);
  }, []);

  const handleAnalyze = async (file: File) => {
    setState(AppState.ANALYZING);
    setError(null);

    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const result = reader.result as string;
        const base64String = result.split(',')[1];
        const mimeType = file.type;

        try {
          const detectedAssemblies = await identifyWallAssemblies(base64String, mimeType, materials);
          setAssemblies(prev => [...prev, ...detectedAssemblies]);
          setState(AppState.ESTIMATING);
        } catch (err: any) {
          setError(err.message || "Failed to identify wall types.");
          setState(AppState.ERROR);
        }
      };
      reader.onerror = () => {
        setError("Failed to read file");
        setState(AppState.ERROR);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setError("Unexpected error");
      setState(AppState.ERROR);
    }
  };

  const handleReset = () => {
    setState(AppState.IDLE);
    setAssemblies([]);
    setError(null);
    setActiveProject(null);
    setView('dashboard');
    setShowReport(false);
    setActiveReportTab('proposal');
  };

  const handleOpenProject = (project?: ProjectSummary) => {
    setActiveProject(project || {
      id: `new-${Date.now()}`,
      name: 'New Project',
      company: 'Client',
      status: 'Working Project Progress',
      dueDate: 'TBD',
      projectNumber: '2024-00X'
    });
    setView('project');
    setShowReport(false);
    setActiveReportTab('proposal');
    setState(AppState.ESTIMATING);

    if (!project) {
      setAssemblies([]);
    }
  };

  return (
    <div className="h-screen bg-slate-50 text-slate-900 flex flex-col font-sans overflow-hidden">
      {/* Main Navigation Bar */}
      {view !== 'project' && (
        <header className="sticky top-0 bg-white border-b border-slate-200 flex-none z-50">
          <div className="w-full px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="flex items-center gap-2">
                {logoLoaded ? (
                  <img 
                    src="/logo.jpg" 
                    alt="PlanckOff" 
                    className="h-10 w-auto object-contain"
                  />
                ) : (
                  <div className="h-10 px-3 bg-blue-600 text-white rounded-lg flex items-center justify-center gap-2 font-bold text-sm">
                    <Building2 className="w-5 h-5" />
                    <span>PlanckOff</span>
                  </div>
                )}
              </div>

              <nav className="flex items-center gap-1">
                <button
                  onClick={() => setView('dashboard')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                  ${view === 'dashboard' ? 'text-blue-700 bg-blue-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                >
                  <LayoutDashboard className="w-4 h-4" /> Dashboard
                </button>
                <button
                  onClick={() => setView('team')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                  ${view === 'team' ? 'text-blue-700 bg-blue-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                >
                  <UsersIcon className="w-4 h-4" /> Team Management
                </button>
                <button
                  onClick={() => setView('database')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                  ${view === 'database' ? 'text-blue-700 bg-blue-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                >
                  <Database className="w-4 h-4" /> Database
                </button>
                <button
                  onClick={() => setView('defaultAssemblies')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2
                  ${view === 'defaultAssemblies' ? 'text-blue-700 bg-blue-50' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'}`}
                >
                  <LayoutTemplate className="w-4 h-4" /> Default Assemblies
                </button>
                <div className="h-6 w-px bg-slate-200 mx-2"></div>
                <button
                  onClick={() => setShowSettings(true)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50`}
                >
                  <Settings className="w-4 h-4" /> Settings
                </button>
              </nav>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-slate-400 font-medium">Welcome,</p>
                <p className="text-sm font-bold text-slate-700">Demo User</p>
              </div>
              <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center font-bold border-2 border-white shadow-sm">
                DU
              </div>
            </div>
          </div>
        </header>
      )}

      {/* Main Content Area */}
      <main className="flex-1 relative overflow-y-auto">
        {view === 'dashboard' && <Dashboard onOpenProject={handleOpenProject} />}
        {view === 'team' && <TeamManagement />}
        {view === 'database' && <DatabaseManager materials={materials} onUpdateMaterials={setMaterials} />}
        {view === 'defaultAssemblies' && <DefaultAssembliesManager templates={defaultAssemblies} onUpdateTemplates={setDefaultAssemblies} materials={materials} />}

        {view === 'project' && (
          <div className="h-full flex flex-col">
            {/* Project View Header */}
            <header className="sticky top-0 bg-white border-b border-slate-200 flex-none z-50">
              <div className="w-full px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setView('dashboard')} className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600">
                    <Briefcase className="w-5 h-5" />
                  </button>
                  <div className="h-6 w-px bg-slate-200"></div>
                  <div>
                    <h1 className="text-base font-bold text-slate-900 leading-none flex items-center gap-2">
                      {activeProject?.name} <span className="text-slate-400 font-normal text-xs">| {activeProject?.projectNumber}</span>
                    </h1>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5 uppercase tracking-wide">{activeProject?.company}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setDisplayUnit(u => u === 'imperial' ? 'metric' : 'imperial')}
                    className="text-xs font-medium px-3 py-1.5 rounded border transition-colors flex items-center gap-2 text-slate-600 hover:bg-slate-50 border-slate-200 bg-white shadow-sm"
                    title="Toggle measurement units for reports"
                  >
                    <ArrowLeftRight className="w-4 h-4" />
                    {displayUnit === 'imperial' ? 'Imperial' : 'Metric'}
                  </button>

                  <div className="h-6 w-px bg-slate-200 mx-1"></div>

                  <button
                    onClick={() => {
                      if (showReport && activeReportTab === 'materials') {
                        setShowReport(false);
                      } else {
                        setShowReport(true);
                        setActiveReportTab('materials');
                      }
                    }}
                    className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors flex items-center gap-2
                      ${showReport && activeReportTab === 'materials' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border-transparent'}`}
                  >
                    <Box className="w-4 h-4" /> Materials
                  </button>

                  <button
                    onClick={() => {
                      if (showReport && activeReportTab === 'labor') {
                        setShowReport(false);
                      } else {
                        setShowReport(true);
                        setActiveReportTab('labor');
                      }
                    }}
                    className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors flex items-center gap-2
                      ${showReport && activeReportTab === 'labor' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border-transparent'}`}
                  >
                    <UsersIcon className="w-4 h-4" /> Labor
                  </button>

                  <button
                    onClick={() => {
                      if (showReport && activeReportTab === 'markups') {
                        setShowReport(false);
                      } else {
                        setShowReport(true);
                        setActiveReportTab('markups');
                      }
                    }}
                    className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors flex items-center gap-2
                      ${showReport && activeReportTab === 'markups' ? 'bg-purple-50 text-purple-700 border-purple-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border-transparent'}`}
                  >
                    <Percent className="w-4 h-4" /> Markups
                  </button>

                  <div className="h-6 w-px bg-slate-200 mx-2" />

                  <button
                    onClick={() => {
                      if (showReport && (activeReportTab === 'proposal' || activeReportTab === 'bidding')) {
                        setShowReport(false);
                      } else {
                        setShowReport(true);
                        setActiveReportTab('proposal');
                      }
                    }}
                    className={`text-xs font-medium px-3 py-1.5 rounded border transition-colors flex items-center gap-2
                      ${showReport && (activeReportTab === 'proposal' || activeReportTab === 'bidding') ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm' : 'text-slate-600 hover:bg-slate-50 border-transparent'}`}
                  >
                    <FileText className="w-4 h-4" /> Reports
                  </button>
                  <div className="h-6 w-px bg-slate-200 mx-1"></div>
                  <button onClick={handleReset} className="text-xs font-medium text-slate-500 hover:text-red-600 flex items-center gap-1 px-2">
                    <LogOut className="w-3 h-3" /> Exit Project
                  </button>
                </div>
              </div>
            </header>

            {/* Error Toast */}
            {state === AppState.ERROR && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center gap-4 shadow-lg">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  <span className="font-medium">{error || 'An error occurred'}</span>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="text-red-400 hover:text-red-600 ml-4"
                >
                  ×
                </button>
              </div>
            )}

            <div className="flex-1 overflow-hidden">
              <EstimateResult
                assemblies={assemblies}
                onReset={handleReset}
                materials={materials}
                onUpdateMaterials={setMaterials}
                onAnalyze={handleAnalyze}
                isAnalyzing={state === AppState.ANALYZING}
                viewMode="project"
                displayUnit={displayUnit}
                activeReportTab={activeReportTab}
                setActiveReportTab={setActiveReportTab}
                onCloseReport={() => setShowReport(false)}
              />
            </div>
          </div>
        )}
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          settings={appSettings}
          onSave={setAppSettings}
          rolePermissions={rolePermissions}
          onUpdateRoles={setRolePermissions}
        />
      )}
    </div>
  );
};

export default function HomePage() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
