# Team Management Implementation Documentation

## Overview

This document outlines the implementation of a role-based team management system with email invitation functionality using Supabase.

## Current State (After Implementation)

- **Database**: New `roles`, `team_members`, and `invitations` tables created
- **Team Page**: Fetches from database, supports invite/edit/delete operations
- **Invite Modal**: Pre-selects role from role-specific boxes, sends invitation emails
- **Email Service**: Integrated with Supabase Auth (with dev mode fallback)

## Target State ✅ IMPLEMENTED

A complete role-based team invitation system where:
1. ✅ Admins can invite Team Leads and Estimators
2. ✅ Team Leads can manage Estimators under them
3. ✅ Invitations are sent via Supabase email with secure tokens
4. ✅ Users set their passwords via a dedicated page

---

## Role Hierarchy

```
Administrator (Admin)
    └── Team Lead
            └── Estimator
```

**Note**: Senior Estimator role has been removed as per requirements.

---

## Database Schema Changes

### 1. New Table: `roles` ✅
```sql
CREATE TABLE roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  level INTEGER NOT NULL, -- 1=Admin, 2=Team Lead, 3=Estimator
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 2. New Table: `team_members` ✅
```sql
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255), -- NULL until password is set
  name VARCHAR(255) NOT NULL,
  role_id UUID REFERENCES roles(id),
  initials VARCHAR(10),
  status VARCHAR(20) DEFAULT 'Invited', -- Invited, Active, Inactive
  invited_by UUID REFERENCES team_members(id),
  reports_to UUID REFERENCES team_members(id), -- For hierarchy
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 3. New Table: `invitations` ✅
```sql
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  role_id UUID REFERENCES roles(id),
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  invited_by UUID REFERENCES team_members(id),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE, -- NULL if not used
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### 4. Seed Roles Data ✅
```sql
INSERT INTO roles (name, level, description) VALUES
  ('Administrator', 1, 'Full system access and team management'),
  ('Team Lead', 2, 'Manage estimators and oversee projects'),
  ('Estimator', 3, 'Create and manage estimates');
```

---

## Implementation Tasks

### Phase 1: Database Setup ✅
- [x] Create migration for `roles` table (`003_create_roles_table.sql`)
- [x] Create migration for `team_members` table (`004_create_team_members_table.sql`)
- [x] Create migration for `invitations` table (`005_create_invitations_table.sql`)
- [x] Seed initial roles (Administrator, Team Lead, Estimator)
- [x] Migrate existing admin user to team_members table
- [x] Update auth_sessions to reference team_members
- [x] Add TypeScript types for new tables (`src/types/team.ts`)

### Phase 2: API Routes ✅
- [x] Create `POST /api/team/invite` - Send invitation email
- [x] Create `GET /api/team/invite/[token]` - Validate invitation token
- [x] Create `POST /api/team/set-password` - Set password for invited user
- [x] Create `GET /api/team/members` - List all team members
- [x] Create `DELETE /api/team/members/[id]` - Remove team member
- [x] Create `PUT /api/team/members/[id]` - Update team member
- [x] Create `GET /api/team/roles` - List all roles

### Phase 3: Email Service Integration ✅
- [x] Configure Supabase Auth for email sending
- [x] Create email template for invitations
- [x] Implement invitation email sending function
- [x] Dev mode fallback (logs invitation URL to console)

### Phase 4: Frontend - Set Password Page ✅
- [x] Create `/set-password/[token]` page
- [x] Add password validation (min 8 chars, uppercase, lowercase, number)
- [x] Add confirm password field
- [x] Handle token validation errors
- [x] Redirect to login after successful password set

### Phase 5: Frontend - Team Management Updates ✅
- [x] Remove Senior Estimator from role options
- [x] Update invite modal to accept pre-selected role
- [x] Add role restriction when inviting from role-specific box
- [x] Fetch team members from database instead of local state
- [x] Implement delete member functionality with API
- [x] Update member status display (Active/Invited/Inactive)
- [x] Add loading states and error handling

### Phase 6: Auth System Updates ✅
- [x] Update login to use team_members table (with admins fallback)
- [x] Update constants to remove Senior Estimator
- [x] Add role-based permission checks in API routes

---

## API Specifications

### POST /api/team/invite
**Request:**
```json
{
  "email": "user@example.com",
  "name": "John Doe",
  "role": "Team Lead"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Invitation sent successfully",
  "invitationUrl": "http://localhost:3000/set-password/uuid" // Dev only
}
```

### GET /api/team/invite/[token]
**Response (valid token):**
```json
{
  "valid": true,
  "invitation": {
    "email": "user@example.com",
    "name": "John Doe",
    "role": "Team Lead"
  }
}
```

**Response (invalid/expired token):**
```json
{
  "valid": false,
  "error": "Invitation expired or already used"
}
```

### POST /api/team/set-password
**Request:**
```json
{
  "token": "invitation-token-uuid",
  "password": "SecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Account created successfully. You can now log in."
}
```

### GET /api/team/members
**Response:**
```json
{
  "success": true,
  "members": [
    {
      "id": "uuid",
      "email": "user@example.com",
      "name": "John Doe",
      "initials": "JD",
      "status": "Active",
      "role": {
        "id": "uuid",
        "name": "Team Lead",
        "level": 2
      }
    }
  ]
}
```

### DELETE /api/team/members/[id]
**Response:**
```json
{
  "success": true,
  "message": "Team member deleted successfully"
}
```

### PUT /api/team/members/[id]
**Request:**
```json
{
  "name": "Updated Name",
  "role": "Estimator",
  "status": "Active"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Team member updated successfully"
}
```

---

## File Structure (Created/Modified)

```
src/
├── app/
│   ├── (protected)/
│   │   └── team/
│   │       └── page.tsx
│   ├── api/
│   │   └── team/
│   │       ├── invite/
│   │       │   ├── route.ts ✅
│   │       │   └── [token]/
│   │       │       └── route.ts ✅
│   │       ├── members/
│   │       │   ├── route.ts ✅
│   │       │   └── [id]/
│   │       │       └── route.ts ✅
│   │       ├── roles/
│   │       │   └── route.ts ✅
│   │       └── set-password/
│   │           └── route.ts ✅
│   └── set-password/
│       └── [token]/
│           └── page.tsx ✅
├── components/
│   └── features/
│       ├── auth/
│       │   └── SetPasswordForm.tsx ✅
│       └── team/
│           └── TeamManagement.tsx ✅ (modified)
├── lib/
│   ├── db/
│   │   └── team.ts ✅
│   └── email/
│       └── invitation.ts ✅
├── types/
│   ├── index.ts ✅ (modified - removed Senior Estimator)
│   └── team.ts ✅
└── constants/
    ├── project.ts ✅ (modified)
    └── roles.ts ✅

supabase/
└── migrations/
    ├── 003_create_roles_table.sql ✅
    ├── 004_create_team_members_table.sql ✅
    └── 005_create_invitations_table.sql ✅
```

---

## Running Migrations

To apply the database changes, run the migrations in order:

```bash
# Using Supabase CLI
supabase db push

# Or run individual migrations via Supabase Dashboard SQL editor
```

---

## Security Considerations

1. **Invitation Tokens**: UUID v4, expire after 7 days
2. **Password Requirements**: Min 8 characters, one uppercase, one lowercase, one number
3. **RBAC**:
   - Admins can invite Team Leads and Estimators
   - Team Leads can only invite Estimators
   - Estimators cannot invite anyone
4. **Token Single Use**: Tokens are invalidated after password is set
5. **Session Security**: httpOnly cookies with 7-day expiration

---

## Environment Variables

Required in `.env`:
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public anon key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-side)
- `NEXT_PUBLIC_SITE_URL` - Application URL for email links (e.g., http://localhost:3000)

---

## Testing Checklist

- [ ] Run database migrations
- [ ] Send invitation email to new user
- [ ] Verify invitation link works (check console in dev mode)
- [ ] Verify expired token shows error
- [ ] Verify used token cannot be reused
- [ ] Set password successfully creates account
- [ ] New user can log in with set password
- [ ] Team members list updates after invite accepted
- [ ] Role-specific invite only shows that role
- [ ] "Add Team Member" allows all invitable roles
- [ ] Delete team member works
- [ ] Role hierarchy is enforced

---

## Development Notes

### Email in Development Mode
In development mode, the invitation URL is logged to the console instead of sending an actual email:

```
=== INVITATION EMAIL (DEV MODE) ===
To: user@example.com
Name: John Doe
Role: Team Lead
Invited by: Admin User
Set Password URL: http://localhost:3000/set-password/uuid-token
===================================
```

Use this URL to test the set password flow.

### Production Email Setup
For production, ensure:
1. Supabase email templates are configured
2. SMTP settings are set in Supabase Dashboard
3. `NEXT_PUBLIC_SITE_URL` is set to the production URL
