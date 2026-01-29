export interface TeamMember {
  id: string;
  name: string;
}

export const TEAM_MEMBERS: TeamMember[] = [
  { id: 'all', name: 'All Members' },
  { id: 'u1', name: 'Demo User (Me)' },
  { id: 'u2', name: 'Sarah Jenkins' },
  { id: 'u3', name: 'Mike Ross' }
];
