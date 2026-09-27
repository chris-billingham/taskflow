# Getting Started with Taskflow

## Creating Your Account

1. Open Taskflow in your browser at the address your administrator gave you. (A local development setup runs at http://localhost:31779.)
2. Click **Sign up** and enter your name, email and a password (8+ characters).
3. You're signed in and taken to your **Today** view.

New installs are **invite-only**. If the sign-in page says "New accounts are by invitation", you need a workspace invite link or an administrator to create your account. The very first account on a fresh install can always sign up. See [user management](../admin-guide/user-management.md#who-can-sign-up) for details.

If the server has email set up, you'll also get a verification email. Click the link in it before your next sign-in, because password sign-in is blocked until your address is verified. The sign-in page can resend the email.

## The Interface

```
┌─────────────────────────────────────────────────────┐
│  Sidebar          │  Main content area               │
│                   │                                  │
│  Workspace ▾      │  Today                           │
│  Inbox            │  ─────────────────────────────   │
│  Today            │  ○  Buy groceries     Today      │
│  Upcoming         │  ○  Call dentist      Tomorrow   │
│  Filters & Labels │                                  │
│                   │  + Add task                      │
│  MY PROJECTS  +   │                                  │
│  ● Work           │                                  │
│  ● Personal       │                                  │
│                   │                                  │
│  (you) ▴          │                                  │
└─────────────────────────────────────────────────────┘
```

- **Inbox**: your default project, pinned at the top of the sidebar. Tasks from Quick Add go here unless you name a project.
- **Today**: tasks due today, grouped into Morning, Afternoon, Evening and No time, plus any overdue tasks. **Reschedule all** moves every overdue task to today.
- **Upcoming**: tasks due in the next 14 days, grouped by day, plus overdue tasks and a **No date** section. Drag a task onto another day to reschedule it.
- **Filters & Labels**: manage your labels and saved filters.
- **Favorites**: projects you've starred. Starred labels and filters get their own section below it.
- **My Projects**: your personal projects. **Team Projects** appears when a workspace is selected in the switcher at the top.
- **Your name** (bottom): Settings, Workspace settings and Log out.

Today and Upcoming include tasks from every project you can see, including team projects.

Search is the magnifying glass at the top right, or press `/`.

## Your First Task

Click **+ Add task** at the bottom of a list, or press `Q` anywhere (outside a text field) to open Quick Add. There's also a round **+** button at the bottom right on desktop.

Type a task name and press `Enter`. You can set details while you type:

```
Buy milk tomorrow p1
Call dentist monday at 3pm @work
Water plants every Monday
Write report in 3 days for 2h #Work
```

Quick Add understands:

- **Dates**: `today`, `tomorrow`, `next week` (next Monday), `in 3 days`, a weekday name such as `monday` (the next one), or a month and day such as `May 10`
- **Time**: `at 3pm`, `at 15:00`, `at 3:30pm`
- **Priority**: `p1` (highest) to `p4` (none), or `!!!`, `!!`, `!`
- **Project**: `#ProjectName`: the exact name (any case) of a project you can add tasks to, team projects included. Names with spaces can't be typed this way; pick the project in the task instead.
- **Labels**: `@labelname` (must be one of your existing labels)
- **Duration**: `for 30m`, `for 2h`, `for 1h30m`
- **Repeat**: `every day`, `every 2 weeks`, `every month`, `every year`, `every Monday`

Things it doesn't understand yet:

- Numeric dates such as `2025-05-10` or `10/05`. Set these with the date picker instead.
- Words around a date. In `next Monday` the date is set, but the word "next" stays in the task name. Write just `monday`.
- An unmatched `@label` word is removed from the name and otherwise ignored. An unmatched `#word` stays in the name, so `Fix issue #42` is left alone.

**+ Add task** under a section in a project adds the text as-is, without parsing.

## Your First Project

1. Click the **+** next to **My Projects** in the sidebar.
2. Enter a name, pick a color, and optionally a parent project and a default view.
3. Click **Add**.

Your project appears in the sidebar. Click it to open it. To start from a ready-made project instead, click **Start from template** in the same dialog.

## Next Steps

- [Managing tasks in detail](tasks.md)
- [Organising with projects and sections](projects.md)
- [Using labels and filters](labels-filters.md)
- [Calendar view](calendar.md)
- [Working with others](collaboration.md)
- [Keyboard shortcuts](keyboard-shortcuts.md)
- [Using Taskflow on a phone](mobile-usage.md)
