# Changelog

All notable changes are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

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
