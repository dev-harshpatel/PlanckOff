# Code Refactoring & Modularity Guide

## Overview
This document outlines the coding standards and modularity principles to follow when working on this project. All code changes must adhere to these guidelines.

## Core Principles

### 1. Component Modularity
- **Components must be reusable**: Extract common UI patterns into separate, reusable components
- **Single Responsibility**: Each component should have one clear purpose
- **Props-based communication**: Pass data and callbacks through props, avoid global state where possible
- **Component composition**: Build complex components from smaller, simpler ones

### 2. File Organization Structure

```
/
├── constants/          # All constant values
│   ├── team.ts        # Team member constants
│   ├── project.ts     # Project-related constants (statuses, permissions)
│   ├── materials.ts   # Material catalog constants
│   ├── formulas.ts    # Formula definitions (moved from components/constants.ts)
│   └── index.ts       # Re-export all constants
│
├── utils/             # Utility functions
│   ├── projectUtils.ts    # Project-related utilities (status colors, etc.)
│   ├── dateUtils.ts        # Date formatting utilities
│   ├── calculationUtils.ts # Calculation utilities (moved from components/)
│   └── index.ts            # Re-export all utilities
│
├── types/             # TypeScript type definitions
│   ├── project.ts     # Project-related types
│   ├── material.ts    # Material-related types
│   ├── assembly.ts    # Assembly-related types
│   └── index.ts       # Re-export all types
│
├── components/
│   ├── ui/            # Reusable UI components
│   │   ├── Modal.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── FormInput.tsx
│   │   └── ...
│   │
│   ├── project/       # Project-specific components
│   │   ├── ProjectCard.tsx
│   │   └── ...
│   │
│   └── [other components] # Feature-specific components
│
├── services/          # External service integrations
└── App.tsx            # Main application component
```

### 3. Constants Management
- **Separate constants by domain**: Team constants, project constants, material constants, etc.
- **No hardcoded values**: Move all magic strings, numbers, and arrays to constants files
- **Centralized access**: Import constants from dedicated files, never duplicate
- **Type safety**: Use TypeScript types for constant arrays (e.g., `ProjectStatus[]`)

### 4. Types & Interfaces
- **Domain-based organization**: Split types by domain (project, material, assembly)
- **Shared types in index**: Re-export commonly used types from `types/index.ts`
- **No `any` types**: Always use proper TypeScript types
- **Interface over type when possible**: Use interfaces for object shapes

### 5. Utility Functions
- **Pure functions**: Utilities should be pure functions when possible
- **Single purpose**: Each utility function should do one thing well
- **Reusable logic**: Extract repeated logic into utilities
- **Proper location**: Calculation utilities, formatting utilities, etc. in `utils/`

### 6. Component Best Practices

#### Props
- **Explicit prop types**: Always define TypeScript interfaces for component props
- **Required vs optional**: Mark props as optional with `?` when appropriate
- **Callback naming**: Use `on` prefix for callbacks (e.g., `onClick`, `onSave`, `onUpdate`)
- **Data passing**: Pass data down via props, never access parent state directly

#### Component Structure
- **Extract sub-components**: If a component is >200 lines, consider extracting sub-components
- **Inline components**: Only define components inline if they're truly single-use
- **Component files**: One component per file (except closely related components)

#### Reusability
- **UI components in `ui/`**: Buttons, inputs, modals, badges go in `components/ui/`
- **Feature components**: Feature-specific components stay in main `components/` folder
- **Composition**: Build complex components by composing simpler ones

### 7. Import Organization
- **Alphabetical sorting**: Sort imports alphabetically within each group
- **Grouping order**:
  1. React and React-related imports
  2. Third-party library imports
  3. Internal type imports
  4. Internal component imports
  5. Internal utility/constant imports
  6. Relative imports (use sparingly)

### 8. Code Quality Standards

#### Naming Conventions
- **Components**: PascalCase (e.g., `ProjectCard`, `StatusBadge`)
- **Functions/constants**: camelCase (e.g., `getStatusColor`, `TEAM_MEMBERS`)
- **Types/Interfaces**: PascalCase (e.g., `ProjectSummary`, `TeamMember`)
- **Event handlers**: `handle` prefix (e.g., `handleClick`, `handleSubmit`)

#### Code Structure
- **Early returns**: Use early returns to reduce nesting
- **DRY principle**: Don't Repeat Yourself - extract duplicated code
- **Readability over performance**: Prioritize readable code unless performance is critical
- **No TODOs**: Complete implementations, no placeholders

### 9. React Best Practices

#### State Management
- **Local state first**: Use `useState` for component-specific state
- **Lift state up**: Move shared state to common ancestor
- **Props down, events up**: Data flows down, events flow up

#### Hooks
- **Custom hooks**: Extract reusable logic into custom hooks when appropriate
- **Dependency arrays**: Always include correct dependencies in `useEffect`, `useMemo`, etc.

#### Performance
- **Memoization**: Use `useMemo` and `useCallback` when appropriate
- **Component splitting**: Split large components to enable better optimization

### 10. Specific Refactoring Rules

#### When Adding New Features
1. Check if constants exist in `constants/` folder
2. Check if utilities exist in `utils/` folder
3. Check if reusable UI components exist in `components/ui/`
4. Create new constants/utils/components only if they don't exist
5. Follow the folder structure above

#### When Modifying Existing Code
1. Identify duplicated code and extract to constants/utils/components
2. Update imports to use centralized constants/utils
3. Ensure components receive data via props
4. Maintain existing functionality while improving structure

#### When Creating New Components
1. Determine if it's a reusable UI component → `components/ui/`
2. Determine if it's feature-specific → `components/` or `components/[feature]/`
3. Define proper TypeScript interfaces for props
4. Extract constants and utilities to appropriate files
5. Use existing UI components when possible

## Checklist for Code Changes

Before committing any changes, ensure:
- [ ] No duplicated constants (check `constants/` folder)
- [ ] No duplicated utility functions (check `utils/` folder)
- [ ] Components are properly typed with interfaces
- [ ] Props are passed correctly (no direct state access)
- [ ] Reusable components are in `components/ui/`
- [ ] Imports are organized and alphabetical
- [ ] No hardcoded values (moved to constants)
- [ ] Code follows DRY principle
- [ ] All functionality is preserved
- [ ] No `any` types used

## Migration Notes

### Files to Move
- `components/constants.ts` → `constants/formulas.ts`
- `components/calculationUtils.ts` → `utils/calculationUtils.ts`
- `types.ts` → Split into `types/project.ts`, `types/material.ts`, `types/assembly.ts`

### Constants to Extract
- `TEAM_MEMBERS` (duplicated in 3 files) → `constants/team.ts`
- `DEFAULT_CATALOG` (in App.tsx) → `constants/materials.ts`
- Project statuses (hardcoded) → `constants/project.ts`
- Role permissions (in App.tsx) → `constants/project.ts`

### Utilities to Extract
- `getStatusColor` (duplicated) → `utils/projectUtils.ts`
- Date formatting functions → `utils/dateUtils.ts`

### Components to Extract
- `ProjectCard` (inline in Dashboard.tsx) → `components/project/ProjectCard.tsx`
- Modal structure (repeated) → `components/ui/Modal.tsx`
- Form inputs (repeated) → `components/ui/FormInput.tsx`
- Status badge (repeated) → `components/ui/StatusBadge.tsx`

## Professional Development Standards

- **Code reviews**: All code should be reviewable and maintainable
- **Documentation**: Complex logic should have comments explaining the "why"
- **Testing readiness**: Structure code to be easily testable
- **Scalability**: Structure should support future growth
- **Consistency**: Follow established patterns throughout the codebase

---

**Remember**: The goal is to create maintainable, scalable, and professional code that follows React and TypeScript best practices while maintaining all existing functionality.
