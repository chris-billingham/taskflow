# Calendar View

The calendar shows tasks by due date. It has a **Week** view (the default) and a **Month** view.

## Opening Calendar View

Open a project and click the **Calendar** icon in the view switcher at the top right. The choice is saved on the project.

Label and filter pages also have a calendar view.

## Navigating

- **← →** move back or forward a week or a month
- **Today** jumps back to the current week or month
- **Week** / **Month** switch between the two views
- In Month view, click a date number (or **+N more**) to open that week in Week view

## Week View

- Tasks with a due time sit in hourly slots. Tasks with a date but no time appear in an **Anytime** row at the top.
- A task's height reflects its duration. Drag the bottom edge of a task to change its duration.
- A line marks the current time.

## Adding Tasks from the Calendar

- In Month view, click an empty part of a day to add a task due that day.
- In Week view, click a time slot to add a task on that day.

The dialog is a Quick Add box, so `p1`, `@label` and the other Quick Add words work there too.

Known issues:
- A task added on **today's** date from the calendar is currently given the same date **next year**.
- A Week-view slot doesn't set a due time yet. The slot's time (for example `14:00`) ends up in the task name.

Until these are fixed, add the task another way (or drag it afterwards) and set the date and time in the task panel.

## Rescheduling Tasks

Drag a task to another day to change its due date. In Week view, dropping a task on a time slot also sets its due time. Dropping it in the Anytime row keeps its time unchanged.

## Tasks Without Due Dates

The calendar only shows tasks that have a due date. To find tasks without one, use the **No date** section in **Upcoming**, or a filter with `no date`.

## Overdue Tasks

Overdue tasks stay on their original date in the calendar, with no special marking. Task colors show priority, not status. Overdue tasks also appear at the top of **Today** and **Upcoming**, where **Reschedule all** moves them to today.

## Subscribing in Your Calendar App

You can see a project's or a filter's tasks in Apple Calendar, Google Calendar, Outlook or any app that subscribes to calendars by URL.

1. Open the project and choose **Calendar feed** from its **⋯** menu, or open a filter and click the calendar button next to its name.
2. Click **Open in calendar app**, or **Copy** the link and add it as a subscribed calendar (in Google Calendar: **Other calendars → From URL**).

The feed has the open tasks due from 30 days ago to a year ahead. Tasks with a time appear at that time (for their duration, or half an hour), tasks with only a date are all-day events, and deadlines appear as all-day "Deadline:" events. Calendar apps refresh subscriptions on their own schedule, usually within an hour; Google Calendar can take longer.

The link is private: anyone who has it can see those tasks. **Make a new link** stops the old one working, and **Stop sharing** removes it. **Settings → Integrations** lists all your feeds. A feed stops working if you lose access to its project.
