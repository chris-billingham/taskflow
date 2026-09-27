# Labels & Filters

## Labels

Labels are tags you can apply to tasks. Each label has a name and a color.

Labels are **personal**. Each person has their own set, and only you can apply your labels. In a shared project, other members can see labels you've put on a task, but they can't use your labels on their tasks.

### Creating a Label

1. Open **Filters & Labels** from the sidebar.
2. Click **Add label**.
3. Enter a name, pick a color and click **Add**.

You can also create a label from a task's label picker by typing a name that doesn't exist yet.

### Applying Labels

Open a task and click the label button next to **Labels** to pick from your labels. A task can have several labels. In Quick Add, type `@labelname` to apply an existing label.

### Viewing Tasks by Label

Click a label in **Filters & Labels** to see every task with that label, across all projects. The label page has a list view and a calendar view.

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
| `p1`, `p2`, `p3`, `p4` (or `priority 1` … `priority 4`) | Tasks with that priority |
| `#Project` | Tasks in a project **you own** with exactly that name |
| `##Project` | Tasks in any project you can see with that name, including team projects. `##Parent/Child` targets a sub-project. |
| `!#Project` | Tasks not in that project |
| `@label` | Tasks with one of your labels |
| `assigned to: me`, `assigned to: <name>` | Tasks assigned to you or to someone whose name contains that text |
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

Apart from `today`, `tomorrow`, `overdue` and `no date`, terms match completed tasks as well. Add `& !completed` if you only want open ones. A filter shows up to 200 tasks.

### Using a Filter

Click the filter name in **Filters & Labels**, or star it to show it in the sidebar. The filter page has a list view and a calendar view, and it remembers which one you chose.

The filter runs when you open it and again after changes you make on that page. It doesn't update live when tasks change elsewhere. Reopen it to refresh.

### Editing or Deleting a Filter

In **Filters & Labels**, hover a filter and use the pencil to edit its name, query and color, or the bin to delete it. You can also rename a filter from its own page.
