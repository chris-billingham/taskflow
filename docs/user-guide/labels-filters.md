# Labels & Filters

## Labels

Labels are tags you can apply to tasks. Each label has a name and a color.

Every label belongs to a space, just like projects:

- **Your labels** are for your own projects. Only you see them in your list, and only you can rename or delete them.
- **Team labels** belong to a workspace. Everyone in it (except guests) sees the same ones and can add, rename or delete them.

A task can only use labels from its project's space: team labels in a workspace's projects, your labels in your own. In someone else's project that they've shared with you, you use their labels. Within a space, names are unique regardless of case, so `Urgent` and `urgent` count as the same label. Your favorite labels and their order are your own, even for team labels.

### Creating a Label

1. Open **Filters & Labels** from the sidebar.
2. Click **Add label**.
3. Enter a name and pick a color. If you're in a workspace, choose **Where** it goes: your labels, or a workspace's team labels.
4. Click **Add**.

You can also create a label from a task's label picker, or in Quick Add, by typing a name that doesn't exist yet. It's created in the space of the task's project.

### Applying Labels

Open a task and click the label button next to **Labels** to pick from the labels of its project's space. A task can have several labels. In Quick Add, type `@labelname` to apply a label from the space of the project the task is going into.

When you move a task to a project in another space, its labels go with it by name, and any the new space doesn't have yet are created there. Applying a label to several selected tasks at once uses the label of that name in each task's space; tasks whose space has no such label are left alone.

### Viewing Tasks by Label

Click a label in **Filters & Labels** to see every task with that label, across all projects. Labels match by name, so a label page or an `@label` filter includes same-named labels from every space you can see. The label page has list, board and calendar views. The board groups tasks by priority, due date, assignee or project; see [grouping a board](projects.md#grouping-a-board). Dragging a card between project columns moves the task to that project.

Star a label to show it in the sidebar.

---

## Filters

A saved filter is a named **text query**. Filters are personal, like labels.

### Creating a Filter

1. Open **Filters & Labels** from the sidebar.
2. Click **Add filter**.
3. Enter a name and a query, for example `today & p1` or `(overdue | today) & #Work`. Suggestions appear as you type, and the query is checked for mistakes such as unbalanced parentheses.
4. Pick a color. Click **Preview** to see what matches, then **Add**.

### Query Language

Combine terms with operators:

| Operator | Meaning |
|----------|---------|
| `&` | and |
| `\|` | or |
| `!` | not (put it in front of a term or a group) |
| `( )` | grouping |

`&` binds more tightly than `|`, so `a | b & c` means `a | (b & c)`.

Terms:

| Term | Matches |
|------|---------|
| `today`, `tomorrow`, `overdue`, `no date` | Incomplete tasks due today / due tomorrow / overdue / with no due date |
| `due: <date>` | Tasks due on a date: `today`, `tomorrow`, `yesterday`, `2025-05-10`, or a range such as `next 7 days` |
| `due before: <date>`, `due after: <date>` | Tasks due before or after a date |
| `deadline`, `no deadline` | Open tasks with or without a deadline |
| `deadline passed` | Open tasks whose deadline has passed |
| `deadline: <date>` | Tasks with a deadline on a date, or in a range such as `next 7 days` |
| `deadline before: <date>`, `deadline after: <date>` | Tasks with a deadline before or after a date |
| `p1`, `p2`, `p3`, `p4` (or `priority 1` … `priority 4`) | Tasks with that priority |
| `#Project` | Tasks in any project you can see with exactly that name (any case), including team projects. If names clash, your own project wins. |
| `##Project` | Tasks in any project you can see with that name, including team projects. `##Parent/Child` targets a sub-project. |
| `!#Project` | Tasks not in that project |
| `@label` | Tasks with one of your labels |
| `assigned to: me`, `assigned to: <name>` | Tasks assigned to you, or to someone you work with whose name contains that text |
| `assigned by: me`, `assigned by: <name>` | Assigned tasks created by you or by that person |
| `created: <date>`, `created before: <date>`, `created after: <date>` | Tasks by creation date |
| `recurring`, `!recurring` | Repeating / non-repeating tasks |
| `completed`, `!completed` | Completed / incomplete tasks |
| `subtask`, `!subtask` | Sub-tasks / top-level tasks |
| `search: <text>`, or any other text | Tasks whose name or description contains the text |

Examples:

```
today & p1
(today | overdue) & ##Work
@waiting & !completed
assigned to: me & due: next 7 days
completed & created after: 2025-01-01
```

Apart from `today`, `tomorrow`, `overdue` and `no date`, terms match completed tasks as well. Add `& !completed` if you only want open ones. Long results load a page at a time: use **Load more tasks** at the bottom of the list.

### Using a Filter

Click the filter name in **Filters & Labels**, or star it to show it in the sidebar. The filter page has list, board and calendar views, and it remembers which one you chose. The board can be grouped by priority, due date, assignee or project, as on a label page.

The filter runs when you open it and again after changes you make on that page. It doesn't update live when tasks change elsewhere. Reopen it to refresh.

### Editing or Deleting a Filter

In **Filters & Labels**, hover a filter and use the pencil to edit its name, query and color, or the bin to delete it. You can also rename a filter from its own page.
