# Importing and Exporting

Both are under **Settings → Data & Privacy**.

## Exporting

**Download my data** saves a ZIP of everything in the projects you own: their
sections, tasks (with subtasks, due dates and times, durations, deadlines,
repeats, priorities and labels), comments and attached files, plus your labels,
your filters and your recent activity. Projects other people own aren't
included; they can export them.

Inside the ZIP, `export.json` describes it all and `attachments/` holds the
files. You can import the ZIP into any Taskflow, including this one.

## Importing

Choose a file and click **Import**. Everything is added as **new projects in
your own space**; nothing you already have is changed. Afterwards Taskflow
says what it created and lists anything it couldn't bring in as it was.

| File | What you get |
|------|--------------|
| A Taskflow export (`.zip`, or just `export.json`) | Its projects, sections, tasks, comments, attachments, labels and filters. Tasks from an exported Inbox go into your Inbox. Comments written by someone else start with who wrote them. |
| A Todoist CSV (from a project's **⋯ → Export as a template**) | One project named after the file, with its sections, subtasks, labels (`@label` in the task name), comments, priorities, durations, deadlines and dates, including repeating ones such as "every monday". |
| A Todoist backup (`.zip` of CSVs, from **Settings → Backups**) | One project per CSV. |
| Any other CSV | One task per row (see below). |

Imports can be up to 200 MB unless your administrator changed the limit.

### CSV columns

The first row names the columns; only `content` is required, and names aren't
case-sensitive.

| Column | Meaning |
|--------|---------|
| `content` (or `task`, `title`, `name`) | The task |
| `description` (or `notes`) | Its description |
| `project` | Which project it goes in; one project is made per name. Without this column, the file's name is used |
| `section` | A section in that project |
| `due` (or `due date`) | `2026-10-05`, or words Quick Add understands, like `next friday` or `every month` |
| `due time` | `09:30` |
| `deadline` | `2026-10-12` |
| `priority` | `1` to `4`, or `p1` to `p4` (1 is the highest) |
| `labels` | Comma-separated label names |
| `completed` | `yes`, `true`, `x` or `1` for a completed task |

```csv
content,project,section,due,priority,labels
Book flights,Trip,,2026-11-01,p2,"travel, admin"
Pack,Trip,Before we go,,,
Renew passport,Admin,,next friday,1,
```
