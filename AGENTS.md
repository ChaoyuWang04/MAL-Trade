## Core Directives
Think ultra hard. Plan doc reading wisely (context limits). Always articulate reasoning step-by-step, identify affected system parts. Ask questions to align expectations. After changes: update docs in `docs/` (specify which: api.md/backend.md/database.md/frontend.md/prd.md/structure.md/trd.md) + git commit.
### Standard Flow
**Phase 1: Requirement Analysis**
1. Identify core requirement 2. Determine scope (which parts affected) 3. Define success criteria
**Phase 2: Current State Assessment**
1. Create search plan (including reading relevant docs in `docs/` first) 2. Execute search and read files 3. Document current implementation (patterns, reusable parts)
**Phase 3: Planning**
1. Identify target workspace(s) 2. Create ordered task list 3. Identify which docs to update (API changes→api.md, DB changes→database.md, FE changes→frontend.md, BE logic→backend.md, new features→prd.md, structure changes→structure.md, tech decisions→trd.md) 4. **Confirm plan with user before proceeding**
**Phase 4: Execution**
1. Announce plan ("Will modify X files...") 2. Execute step-by-step per workspace rules 3. Validate each step 4. Update identified docs in `docs/` (keep concise but include necessary details) 5. Git commit with proper message

### Technology Stack
<!-- Update this section per project per progression -->
- **Framework**: Next.js (App Router) + React
- **Language**: TypeScript
- **Runtime**: Node.js
- **Backend**: Fastify + WebSocket (ws)
- **Database**: PostgreSQL (Neon/Supabase)
- **Styling**: Tailwind CSS
- **Component Library**: shadcn/ui (Radix UI primitives)
- **Motion & Charts**: Framer Motion + TradingView Lightweight Charts (+ Recharts)
- **State Management**: TanStack Query + Zustand
- **Chain**: Moonbeam Moonbase Alpha (Polkadot EVM)
- **Testing**: TBD (define via Justfile)

## 🛠️ Build, Test & Development
### Common Commands
<!-- Update this section per project per progression-->
| Task | Command | Purpose |
|------|---------|---------|
| **Install deps** | `just deps` | Sync dependencies |
| **Dev server** | `just dev` | Local development |
| **Build** | `just build` | Create production artifacts |
| **Test** | `just test` | Run test suite |
| **Lint** | `just lint` | Code quality check |
| **Deploy** | `just deploy` | Deployment (if configured) |
### Development Workflow
**Daily**: Install deps → Start dev servers (optional) → Make changes
**Pre-commit (REQUIRED)**: Run build commands to verify compilation → Optional: test + lint
### Database Query Script
**Read-only verification**: `scripts/db-query.sh "<SQL>"` - ✅ Only SELECT with `is_deleted = false` filter - 🚫 Never UPDATE/DELETE/INSERT/TRUNCATE, use migrations for schema changes
### ⚠️ Critical Rules
1. **Build before PR** - Always verify frontend + backend compiles 2. **Soft delete everywhere** - All queries must filter `is_deleted = false` 3. **No writes in query script** - Use proper migration tools 4. **Dev servers optional** - Only run when actively testing


## Database Migration Workflow
### Core Principle
Design Doc → Schema Definition → Migration → Database → ORM. Single source of truth: Design docs. Never run migrations in app code. All changes traceable and reversible.
### Absolute Rules
**NEVER execute without confirmation:**
- DROP DATABASE/SCHEMA, TRUNCATE, DELETE WHERE 1=1
- Any write production database
- `just db-reset` without `-dev` suffix
- Direct SQL bypassing migration system
- Any schema changes, migrations (including dev), bulk import/export
**Safe operations (no confirmation needed):** SELECT queries, view migration status, generate migration files (not apply), review SQL files
**Before any DB operation:** Check NODE_ENV + DATABASE_URL port, print environment info, wait for confirmation
### Standard Flow
<!-- Update the exact command per project and don't change steps-->
1. Update design: `[docs/architecture/data-model]` 2. Update schema: `[backend/db/schema/*.hcl / prisma/schema.prisma / models.py]` 3. Generate migration: `[just migrate-new "msg" / npx prisma migrate dev / alembic revision]` 4. **STOP: Show me the SQL file** 5. Review SQL: `[backend/migrations/*.sql / prisma/migrations/ / alembic/versions/]` 6. **STOP: Wait for approval** 7. Apply: `[just migrate-up / npx prisma migrate deploy / alembic upgrade head]` 8. Verify: `[just migrate-status / npx prisma migrate status / alembic current]` 9. Export schema: `[just gen-schema / db:schema:dump / custom export script]` 10. Generate ORM: `[just gen-orm / npx prisma generate / sqlc generate]`



## 💅 Coding Style & Naming
### Format & Lint
- **Auto-format**: Run `[prettier/gofmt/black]` before commit
- **Linter**: Follow `[eslint/golangci-lint/ruff]` config
- **Indentation**: `[2 spaces / 4 spaces / tabs]`
### Naming Conventions
| Element | Convention | Example |
|---------|-----------|---------|
| **Variables/Functions** | `[camelCase/snake_case]` | `getUserData` / `get_user_data` |
| **Classes/Components** | `PascalCase` | `UserProfile`, `DataTable` |
| **Files/Directories** | `[kebab-case/snake_case]` | `user-profile/` / `user_profile/` |
| **Constants** | `[UPPER_SNAKE_CASE/camelCase]` | `API_KEY` / `apiKey` |
| **Interfaces/Types** | `PascalCase` + domain prefix | `UserService`, `IAuthProvider` |
### Code Organization
- **Shared code**: `shared/[types/utils/schemas]` - Reuse across modules
- **Feature co-location**: Keep related files together (`hooks/`, `utils/`, `types/` per feature)
- **Import ordering**: Standard lib → 3rd party → Internal
### Project-Specific Rules
- Backend: `[Go modules in snake_case, exported symbols PascalCase]`
- Frontend: `[React components PascalCase, route folders kebab-case]`
- Shared: `[Zod/Pydantic schemas in shared/ directory]`


## UI/UX design
### Design Principles
- Comprehensive design checklist in `/context/design-principles.md`
- Brand style guide in `/context/style-guide.md`
- When making visual (front-end, UI/UX) changes, always refer to these files for guidance
### Quick Visual Check
IMMEDIATELY after implementing any front-end change:
1. **Identify what changed** – Review the modified components/pages
2. **Navigate to affected pages** – Use `mcp__playwright__browser_navigate` to visit each changed view
3. **Verify design compliance** – Compare against `/context/design-principles.md` and `/context/style-guide.md`
4. **Validate feature implementation** – Ensure the change fulfills the user's specific request
5. **Check acceptance criteria** – Review any provided context files or requirements
6. **Capture evidence** – Take full page screenshot at desktop viewport (1440px) of each changed view
7. **Check for errors** – Run `mcp__playwright__browser_console_messages`
This verification ensures changes meet design standards and user requirements.
### Component Library
<!-- Update this section per project per progression-->
| Config | Value |
|--------|-------|
| **Library** | shadcn/ui |
| **Base** | Radix UI primitives |
| **Components Path** | `frontend/src/components/ui/` (default shadcn path) |
| **Styling** | Tailwind CSS + CSS variables |
| **Icons** | lucide-react |
| **Theme** | Tailwind CSS variables |
### Usage Rules
- ✅ Use library components first before building custom
- ✅ Follow library's composition patterns
- ✅ Extend via wrapper components when needed
- 🚫 Don't modify library source files directly

## 🧪 Testing Guidelines
### Test Commands
<!-- Update this section per project per progression-->
`just test` - Backend: `just test-backend` - Frontend: `just test-frontend`
### Test Organization
**Backend**: Co-locate tests with code - `[service/user_test.go / test_user_service.py / user.test.ts]` - **Frontend**: Mirror folder structure - `[Component.test.tsx / useHook.test.ts / component.spec.js]` - **Shared**: Fixtures in `shared/` for cross-layer reuse
### Coverage Priorities
Focus on: Edge cases, business logic (ad targeting/serialization rules), API contracts, data transformations - Don't test: Third-party libraries, framework internals, simple getters/setters
### ⚠️ Rules
✅ Test before commit - ✅ Add tests for bug fixes - ✅ Cover edge cases and error paths - 🚫 Mock everything (test real integrations when possible)

## 📝 Git Commit & PR Guidelines
### Commit Message Format
**Types**: `feat` | `fix` | `docs` | `style` | `refactor` | `test` | `chore`
### Standard Flow
1. **Commit after every change** - Don't leave uncommitted files
2. **Write clear message** - Present tense, reference issue IDs (e.g., `feat(api): add user endpoint #123`)
3. **Create PR with**:
   - Concise description of change
   - Testing evidence (command output/screenshots)
   - Notes on config/schema updates

## 🔄 OpenAPI Sync Workflow
### Core Principle
OpenAPI Schema → Generate Types → Update Implementation
**Single Source of Truth**: `[shared/api-schema / openapi.yaml / swagger.yaml]` - 🚫 Never edit generated files - ✅ Always update OpenAPI first, then regenerate
### Standard Flow (Do NOT skip steps)
<!-- Update this section per project per progression-->
1. **Edit OpenAPI**: Schemas in `[schemas/*.yaml]`, Paths in `[paths/*.yaml]`, Register modules in root yaml
2. **Bundle spec**: `[just bundle-openapi / npm run bundle-api]` → Outputs: `[dist/openapi.bundle.yaml]`
3. **Sync frontend types**: `[just sync-frontend / npm run codegen:frontend]` → Updates: `[types/openapi.d.ts / api.ts]`
4. **Sync backend types**: `[just gen-backend / npm run codegen:backend]` → Generates: `[types.gen.go / types.gen.ts / types.py]`
5. **Update business logic**: Modify `[handlers/** / services/** / controllers/**]` → Verify: `[go build / npm run build / pytest]`
6. **Final check**: `[npm run build / go build / docker build]` (optional but recommended)
### Key Commands
<!-- Update this section per project per progression-->
| Command | Purpose |
|---------|---------|
| `[bundle-openapi-cmd]` | Bundle multi-file OpenAPI into single spec |
| `[sync-frontend-cmd]` | Generate frontend types from OpenAPI |
| `[sync-backend-cmd]` | Generate backend types/server code |
### ⚠️ Critical Rules
Never manually edit `[*.gen.* / generated files]` - All interface changes from OpenAPI yaml - PRs must include proof of sync commands
