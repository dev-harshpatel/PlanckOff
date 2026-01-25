import { ProjectStatus } from '../constants/project';

export const getStatusColor = (status: string): string => {
  switch (status) {
    case 'Working Project Progress': 
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'Under Review': 
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'Submitted': 
      return 'bg-blue-100 text-blue-800 border-blue-200';
    case 'Hold': 
      return 'bg-slate-100 text-slate-600 border-slate-200';
    case 'Archive': 
      return 'bg-purple-100 text-purple-800 border-purple-200';
    default: 
      return 'bg-slate-100 text-slate-800 border-slate-200';
  }
};
