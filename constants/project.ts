import { UserRole } from '../types';

export type ProjectStatus = 
  | 'Working Project Progress' 
  | 'Under Review' 
  | 'Submitted' 
  | 'Hold' 
  | 'Archive';

export const PROJECT_STATUSES: ProjectStatus[] = [
  'Working Project Progress',
  'Under Review',
  'Submitted',
  'Hold',
  'Archive'
];

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  'Administrator': ['All Access'],
  'Team Lead': ['Create Projects', 'Edit All Projects', 'Manage Team', 'View Reports'],
  'Senior Estimator': ['Create Projects', 'Edit Own Projects', 'View Reports'],
  'Estimator': ['View Assigned Projects', 'Edit Own Takeoffs']
};
