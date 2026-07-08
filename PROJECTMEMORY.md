# PROJECT MEMORY — Email Management Phase 2

## Theme Removal

**Files deleted (content replaced with REMOVED marker due to no shell access):**
- `backend/models/EmailTheme.model.js`
- `backend/controllers/emailThemes.controller.js`
- `frontend/src/pages/email/EmailThemes.js`
- `frontend/src/pages/email/EmailThemeFormModal.js`
- `frontend/src/context/EmailThemesContext.js`

**Modifications:**
- `backend/models/index.js` — Removed EmailTheme import/export
- `backend/models/EmailTemplate.model.js` — Removed `themeOverride` field
- `backend/models/EmailLog.model.js` — Removed `theme` field
- `backend/services/emailRenderer.service.js` — Removed all theme resolution (resolveThemeColors, injectThemeHeaderFooter, EmailTheme queries). Template now handles its own styling via `template.css`
- `backend/services/emailSender.service.js` — Removed `themeId` from log creation
- `backend/controllers/emailTemplates.controller.js` — Removed `themeOverride` populate
- `backend/controllers/emailPreview.controller.js` — Removed `themeId` from request/options
- `backend/controllers/emailTest.controller.js` — Removed null theme arg from renderWithTemplate
- `backend/routes/email.routes.js` — Removed 6 theme routes + their Swagger docs + theme tag
- `frontend/src/services/api.js` — Removed 6 theme API methods
- `frontend/src/context/EmailContext.js` — Removed EmailThemesProvider
- `frontend/src/pages/EmailTemplates.js` — Removed theme tab and route

## Variables Module (Admin CRUD)

**New files:**
- `backend/models/EmailVariable.model.js` — Schema: name, key, reference, description, category, isActive, isDeleted, createdBy, updatedBy, timestamps
- `backend/controllers/emailVariables.controller.js` — Full CRUD + bulk import (CSV/JSON) + search + getAllGrouped (merges admin vars + registry vars)
- `frontend/src/pages/email/EmailVariables.js` — List page with table/cards, search, category/status filters, pagination, detail drawer
- `frontend/src/pages/email/EmailVariableFormModal.js` — Create/Edit modal with validation, name/reference/category/description/active
- `frontend/src/pages/email/EmailBulkImportModal.js` — CSV file upload or JSON paste, preview rows, import with result report

**Existing file replaced:**
- `frontend/src/context/EmailVariablesContext.js` — Replaced with mutable context: addVariable, updateVariable, removeVariable with optimistic updates

**New API endpoints:**
- `GET /email/variables` — List with pagination, search, category, isActive filters
- `GET /email/variables/:id` — Get single variable
- `POST /email/variables` — Create variable
- `PUT /email/variables/:id` — Update variable
- `DELETE /email/variables/:id` — Soft delete
- `PATCH /email/variables/:id/toggle` — Toggle isActive
- `POST /email/variables/import` — Bulk import CSV/JSON
- `GET /email/variables/all-grouped` — All variables (admin + registry) grouped by category
- `GET /email/variables/search` — Search across admin + registry variables

## Components Redesign

**Model update:**
- `backend/models/EmailComponent.model.js` — Added `parameters` array with sub-schema: name, key, type (12 types), label, defaultValue, required, options, placeholder, order

**Controller additions:**
- `backend/controllers/emailComponents.controller.js` — Parameters handling in create/update, new `preview` endpoint resolves `{{param.key}}` placeholders, variable placeholders, and component references

**New file:**
- `frontend/src/pages/email/EmailComponentEditor.js` — Full 3-panel editor:
  - LEFT: HTML/CSS textarea (toggleable tabs, +Var button)
  - CENTER: Live iframe preview (debounced 300ms, resolves parameters + variables)
  - RIGHT: Parameters panel (add/remove/edit params with type-specific inputs, sample values for preview)

**Updated files:**
- `frontend/src/pages/email/EmailComponents.js` — Added "Open Editor" button per card, drawer shows parameters
- `frontend/src/pages/email/EmailComponentFormModal.js` — Added parameters array editor with add/remove/edit

**New API endpoint:**
- `POST /email/components/:id/preview` — Preview component with sample parameter and variable values

## Variable Picker (Reusable)

**New file:**
- `frontend/src/components/VariablePicker.js` — Reusable modal component with search, grouped display, double-click/click to select. Fetches variables from `GET /email/variables/search`

**Updated files:**
- `frontend/src/pages/email/EmailBuilder.js` — Refactored to use VariablePicker component instead of inline implementation. Removed direct dependency on EmailVariablesContext
- `frontend/src/pages/email/EmailComponentEditor.js` — Uses VariablePicker for inserting variables into HTML/CSS editors

## Updated Routes & Tabs

**Final 7 tabs** in `EmailTemplates.js`:
1. Templates → `/email/templates`
2. Sections → `/email/sections`
3. Components → `/email/components`
4. Variables → `/email/variables`
5. Usage → `/email/usage`
6. SMTP → `/email/config`
7. Queue → `/email/queue`

**New routes:**
- `/email/components/:id/editor` → EmailComponentEditor
- `/email/variables` → EmailVariables

**Removed routes:**
- `/email/themes` → EmailThemes

## Sections Improvements

- Added stats grid (total sections, total parameters, active sections, total templates)
- Template count per section in sidebar list
- Added `useEmailTemplatesContext` to EmailSections for template count lookup

## API Service Updates (`frontend/src/services/api.js`)

**Removed:**
- `getThemes`, `getTheme`, `createTheme`, `updateTheme`, `deleteTheme`, `activateTheme`

**Added:**
- `getVariables` (with params), `getVariable`, `createVariable`, `updateVariable`, `deleteVariable`, `toggleVariable`, `importVariables`
- `previewComponent`

## Orphaned Files
- `frontend/src/pages/email/EmailLogs.js` — Content replaced with REMOVED marker
