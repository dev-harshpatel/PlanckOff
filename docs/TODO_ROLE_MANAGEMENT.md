# Role Management Feature - Implementation TODO

## Overview
Create a Role Management system where Admins can:
- Create, Read, Update, Delete roles
- Assign permissions to roles
- Promote/demote team members by changing their roles

## Access Control
- **Only Administrators** can access Role Management
- Other roles (Team Lead, Estimator) should NOT see or access this feature

---

## Implementation Tasks

### Phase 1: Database Schema Updates
- [ ] 1.1 Create `permissions` table to store available permissions
- [ ] 1.2 Create `role_permissions` junction table (many-to-many relationship)
- [ ] 1.3 Seed initial permissions data
- [ ] 1.4 Create TypeScript types for permissions

### Phase 2: Database Repository Functions
- [ ] 2.1 Add `getAllPermissions()` function
- [ ] 2.2 Add `createRole()` function
- [ ] 2.3 Add `updateRole()` function
- [ ] 2.4 Add `deleteRole()` function
- [ ] 2.5 Add `getRolePermissions()` function
- [ ] 2.6 Add `updateRolePermissions()` function
- [ ] 2.7 Add `assignRoleToMember()` function (for promote/demote)

### Phase 3: API Routes
- [ ] 3.1 Create `GET /api/admin/roles` - List all roles with permissions
- [ ] 3.2 Create `POST /api/admin/roles` - Create new role
- [ ] 3.3 Create `PUT /api/admin/roles/[id]` - Update role
- [ ] 3.4 Create `DELETE /api/admin/roles/[id]` - Delete role
- [ ] 3.5 Create `GET /api/admin/permissions` - List all permissions
- [ ] 3.6 Create `PUT /api/admin/roles/[id]/permissions` - Update role permissions
- [ ] 3.7 Create `PUT /api/team/members/[id]/role` - Change member's role (promote/demote)

### Phase 4: Frontend Components
- [ ] 4.1 Create `RoleManagement.tsx` - Main role management component
- [ ] 4.2 Create `RoleCard.tsx` - Individual role display card
- [ ] 4.3 Create `RoleFormModal.tsx` - Modal for create/edit role
- [ ] 4.4 Create `PermissionSelector.tsx` - Permission checkboxes component
- [ ] 4.5 Create `PromoteDemoteModal.tsx` - Modal for changing member's role

### Phase 5: Page & Navigation
- [ ] 5.1 Create `/admin/roles` page with RouteGuard (Admin only)
- [ ] 5.2 Add "Role Management" button to Team Management page (Admin only)
- [ ] 5.3 Add route to RBAC configuration
- [ ] 5.4 Add to Navbar (Admin only)

### Phase 6: Integration & Testing
- [ ] 6.1 Wire up all components with API
- [ ] 6.2 Add loading states and error handling
- [ ] 6.3 Test CRUD operations
- [ ] 6.4 Test permission checks
- [ ] 6.5 Test promote/demote functionality

---

## File Structure (New Files)

```
src/
├── app/
│   ├── (protected)/
│   │   └── admin/
│   │       └── roles/
│   │           └── page.tsx          # Role management page
│   └── api/
│       └── admin/
│           ├── roles/
│           │   ├── route.ts          # GET (list), POST (create)
│           │   └── [id]/
│           │       ├── route.ts      # PUT (update), DELETE
│           │       └── permissions/
│           │           └── route.ts  # PUT (update permissions)
│           └── permissions/
│               └── route.ts          # GET (list all permissions)
├── components/
│   └── features/
│       └── admin/
│           ├── index.ts
│           ├── RoleManagement.tsx
│           ├── RoleCard.tsx
│           ├── RoleFormModal.tsx
│           └── PermissionSelector.tsx
├── lib/
│   └── db/
│       └── roles.ts                  # Role & permission DB functions
└── types/
    └── permissions.ts                # Permission types

supabase/
└── migrations/
    ├── 007_create_permissions_table.sql
    └── 008_seed_permissions.sql
```

---

## Database Schema

### permissions table
```sql
CREATE TABLE permissions (
  id UUID PRIMARY KEY,
  code VARCHAR(100) UNIQUE NOT NULL,  -- e.g., 'team.manage', 'projects.create'
  name VARCHAR(255) NOT NULL,          -- e.g., 'Manage Team Members'
  description TEXT,
  category VARCHAR(100),               -- e.g., 'Team', 'Projects', 'Settings'
  created_at TIMESTAMP
);
```

### role_permissions junction table
```sql
CREATE TABLE role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);
```

---

## Permissions Categories (Initial)

1. **Team Management**
   - `team.view` - View team members
   - `team.invite` - Invite new members
   - `team.edit` - Edit team members
   - `team.delete` - Delete team members
   - `team.manage_roles` - Manage roles (Admin only)

2. **Projects**
   - `projects.view` - View projects
   - `projects.create` - Create projects
   - `projects.edit` - Edit projects
   - `projects.delete` - Delete projects
   - `projects.assign` - Assign projects to members

3. **Estimates**
   - `estimates.view` - View estimates
   - `estimates.create` - Create estimates
   - `estimates.edit` - Edit estimates
   - `estimates.approve` - Approve estimates

4. **Settings**
   - `settings.view` - View settings
   - `settings.edit` - Edit settings
   - `admin.access` - Access admin panel

---

## UI Design Notes

- Role Management button should be visible only to Admins
- Use existing Modal, Button, FormField components
- Role cards should show: name, level, member count, permissions
- Permission selector should group permissions by category
- Confirm dialog before deleting roles
- Prevent deleting roles that have members assigned

---

## Current Progress
- [ ] Phase 1: Database Schema Updates
- [ ] Phase 2: Database Repository Functions
- [ ] Phase 3: API Routes
- [ ] Phase 4: Frontend Components
- [ ] Phase 5: Page & Navigation
- [ ] Phase 6: Integration & Testing
