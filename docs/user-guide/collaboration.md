# Collaboration

## Workspaces

Workspaces are how a team shares work in Taskflow. Your Inbox and the projects under **My Projects** are your own space, private to you. Each workspace you belong to has its own section in the sidebar, below My Projects, and every member of a workspace can see its projects.

- **New workspace** at the bottom of the sidebar creates one and opens its settings, so you can invite people.
- The gear next to a workspace's name opens its settings. The **+** adds a project to it.
- You can't share a single project with someone outside the workspace yet.

## Roles

| Role | What they can do |
|------|------------------|
| **Owner** | Everything an Admin can do, plus delete the workspace. There is one owner. |
| **Admin** | Full control of every team project. Invite and remove members, change roles, edit workspace settings. |
| **Member** | View and edit every team project, and create new team projects. |
| **Guest** | View **every** team project in the workspace and comment on tasks. Guests can't edit tasks (except tasks assigned to them) or create projects. |

The invite dialog describes Guest as "access specific shared projects only". That isn't how it works today: a guest can read every team project in the workspace.

## Inviting Members

Owners and admins can invite people:

1. Click the gear next to the workspace's name in the sidebar.
2. Open the **Members** tab and click **Invite**.
3. Enter an email address and choose a role (Member, Admin or Guest).

The dialog shows an invite link you can copy and send yourself. The invite expires after 7 days. If the server has email set up, the link is also emailed. People who already have an account also get an in-app notification. Pending invites appear in the Members tab, where you can resend, cancel or copy them.

When someone opens the link, they sign in, or sign up if they don't have an account yet, and join the workspace. New installs are invite-only, but a valid invite lets that email address create an account. See [user management](../admin-guide/user-management.md#who-can-sign-up).

In the Members tab, admins can change a member's role (**Make admin**, **Make member**, **Make guest**) or **Remove** them. Leaving a workspace and transferring ownership exist in the API but have no button in the app yet.

## Task Assignment

Open a task and click the **Assignee** field to pick a workspace member. They get a notification, and their avatar shows on the task in lists. An assignee can always edit their own task, even as a Guest.

Today and Upcoming show every task you can see, including team tasks assigned to other people.

## Labels in Shared Projects

Labels are personal: you can only apply your own. Labels other members put on a task are visible to everyone who can see the task.

Changing a task's labels currently replaces **all** of its labels, including ones other members added.

## Comments

Open a task to see its comments. Comments support Markdown:

```
**Bold**, _italic_, `code`, [links](https://example.com)
```

Type `@` to mention a project member. Mentioned people get a notification. Comments can have attachments and replies. Press `Cmd/Ctrl+Enter` to send.

You get a comment notification when someone comments on a task you created, are assigned to, or have replied to. There's no way to "watch" other tasks.

## Live Updates

Changes to tasks, sections, comments and projects appear for everyone else viewing them, without a reload. If your connection drops, the app catches up when it reconnects.

Taskflow doesn't show who else is online or viewing a project, and there are no typing indicators.

## Activity Log

The task panel has an **Activity** section showing who changed what and when.

## Notifications

In-app notifications appear under the bell icon (top right on desktop, in the header on a phone). The list checks for new notifications every 30 seconds.

At **Settings → Notifications** you can:
- Turn on **browser push notifications** (your administrator must have configured push for this to work)
- Turn on **email notifications**, sent immediately or as a daily or weekly digest (needs email set up on the server)
- Choose which types you want: task assigned, due soon, overdue, comments, @mentions and workspace invites. Deadline notices (the morning before a deadline, and once it has passed) come under due soon and overdue.

Task reminders are always delivered as browser push.
