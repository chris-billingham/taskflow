# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

### Added

#### Instance administration
- `SystemRole` (`USER` | `ADMIN`) on users — an instance-level role for managing accounts
  across the whole deployment, separate from `WorkspaceRole` and `ProjectRole`. It grants
  no access to other users' tasks, projects or comments.
- Admin console at **Settings → Users** (visible to admins only): list and search accounts,
  create users, promote/demote, suspend/reactivate, reset passwords, delete accounts.
- `/api/v1/admin/*` endpoints, gated by a fresh database read of the caller's role and
  active flag on every request, so demotion and suspension take effect immediately.
- Account suspension (`User.isActive`): blocks sign-in and token refresh, deletes refresh
  tokens and drops live sockets, while keeping all data. Reversible.
- Admin password reset with a server-generated temporary password shown exactly once —
  works with no SMTP configured, which is the default for a self-hosted install.
- `ADMIN_EMAILS` environment variable to bootstrap administrators. Promote-only and
  idempotent; a listed address that registers becomes an admin immediately.
- Guard rails: the last active administrator cannot be demoted, suspended or deleted;
  admins cannot suspend or delete their own account from the console; deletion still
  refuses while the user owns a workspace that other people are members of.

### Changed
- `/users/me` and the login/register responses now include `role` and `isActive`.

## [1.0.0] — 2025-05-01

Initial release.

### Added

#### Core task management
- Task CRUD with content, description, due date, due time, deadline, duration, and priority
- Sub-tasks (parent/child hierarchy)
- Task completion and uncomplete
- Task duplication and move (between projects/sections)
- Bulk operations: complete, delete, move, update priority
- Quick add via natural language parsing ("Buy milk tomorrow p1 #work")
- Recurring tasks with daily, weekly, monthly, and custom rules
- Task reordering via drag-and-drop

#### Project & organisation
- Projects with color and icon
- Sections within projects for column-based grouping
- Labels with custom colors
- Saved filters with complex conditions (AND/OR, any field)
- Board view (Kanban), List view, Calendar view per project

#### Collaboration
- Workspaces with member invitations by email
- Per-task comments
- Activity log for all task changes
- Real-time presence indicators (who's online, who's editing)
- Typing indicators on comments

#### Files & notifications
- File attachments via drag-and-drop (stored in S3 or MinIO)
- Image preview in attachments
- In-app notifications
- Browser push notification subscriptions
- Email notifications via SMTP (optional)
- Task reminders

#### Search & discovery
- Full-text search across tasks, projects, and comments
- Upcoming view (tasks due in the next 7 days)
- Today view (today's tasks + overdue)

#### Settings & account
- User profile (name, avatar)
- Account management (email change, password change)
- Theme preferences (light / dark / system)
- Task display preferences (order, grouping, completed visibility)
- Notification preferences
- Data export (JSON)
- Task templates (create, browse, apply)

#### Developer
- REST API documented with OpenAPI 3.0 (Swagger UI at `/api/docs`)
- JWT authentication (access + refresh tokens, httpOnly cookies)
- WebSocket server for real-time sync
- Background job processing with BullMQ
- Prisma ORM with PostgreSQL
- Docker Compose for development and production
- Integration test suite
- E2E test suite (Playwright)
