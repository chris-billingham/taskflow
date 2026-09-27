# Tasks

## Creating a Task

**Methods:**
- Press `Q` to open Quick Add from anywhere (or click the round **+** button at the bottom right on desktop, or the **+** in the header on a phone)
- Click **+ Add task** at the bottom of a list or project
- Click **+ Add task** under a section, or in a board column
- In Upcoming, add a task under a specific day
- In a calendar, click a day or time slot

Quick Add and the project-level **+ Add task** understand dates, priorities, `#project`, `@label`, durations and repeat phrases as you type. See [Getting Started](getting-started.md#your-first-task) for the full list. Adding under a section or in a board column uses the text as-is.

**Task fields** (set in the task panel):

| Field | Description |
|-------|-------------|
| Name | Required, up to 500 characters |
| Description | Plain-text notes, up to 10,000 characters. Markdown is not rendered here (comments do render Markdown). |
| Due date | The date the task is due, with an optional time |
| Reminders | 30 minutes, 1 hour or 1 day before the due date, or at a specific date and time |
| Repeat | See [Recurring Tasks](#recurring-tasks) |
| Deadline | A separate hard deadline date |
| Priority | 1 (red, highest) → 4 (none) |
| Labels | One or more of your own labels. You can create a new label from the picker. |
| Assignee | A member of the project's workspace (in a personal project, only you) |
| Duration | Estimated time: presets from 15 minutes to 4 hours, or a custom value |

A task's project, section and parent are set when you create it. They can't be changed from the task panel. To move a task to another section, drag it in the Board view. Moving a task to a different project isn't available in the app yet.

## Completing a Task

Click the circle to the left of a task.

- In a project, completed tasks stay in the list, crossed out. Click the circle again to uncomplete.
- In Today and Upcoming, completed tasks drop out of the view.
- To see completed tasks across projects, use a saved filter with the query `completed` (see [Labels & Filters](labels-filters.md)).

## Editing a Task

Click a task to open the task panel on the right. Click the name or description to edit them. Every other field has its own picker.

From the list itself you can also:
- Double-click a task name to rename it inline
- Hover a task to get quick due date and priority buttons, and a **⋯** menu with **Edit**, **Duplicate** and **Delete**

Deleting from the **⋯** menu happens straight away. Deleting from the task panel asks you to confirm first.

## Sub-tasks

Open a task and use **Add subtask** in the **Subtasks** section. Sub-tasks show a count on the parent (for example `1/3`). Click the arrow next to the parent to expand them in the list.

## Recurring Tasks

In the task panel, click **Repeat** and choose a preset:
- Daily
- Every weekday
- Weekly
- Every 2 weeks
- Monthly
- Yearly

Or choose a custom rule: every N days, weeks, months or years, with specific weekdays for weekly rules.

You can also set a repeat from Quick Add with phrases like `every day`, `every 2 weeks` or `every Monday`.

When you complete a recurring task, it stays completed and a new task is created for the next occurrence. The next date is counted from the task's due date. Repeating tasks show a repeat icon in lists.

## Attachments, Comments and Activity

The task panel also has:
- **Attachments**: drag files in or click to upload. Images can be previewed.
- **Comments**: Markdown is supported, `@name` mentions a project member, and comments can have attachments. Press `Cmd/Ctrl+Enter` to send.
- **Activity**: a log of who changed what and when.

## Reordering

Drag a task by the handle (⠿) that appears on the left when you hover. In the List view you can reorder tasks within the same list or section. To move tasks between sections, use the Board view.

## Not Available Yet

- Selecting several tasks for bulk actions (complete, move, delete)
- Moving a task to another project, or changing its section or parent, from the task panel

## Keyboard Shortcuts

See [keyboard-shortcuts.md](keyboard-shortcuts.md).
