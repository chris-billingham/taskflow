# Mobile Usage

Taskflow is a responsive web app. It works in a phone or tablet browser, and you can install it to your home screen.

## Layout

On narrow screens (under 768px wide):
- The sidebar is hidden. Tap the **☰** button at the top left to open it as a drawer. Tap outside it, tap **×**, or pick a page to close it.
- A header bar across the top has **☰**, then search, the notification bell and a **+** button for Quick Add.
- Task lists fill the screen.
- The task panel opens full-width over the list. Close it with **×**.

## Touch Interactions

| Gesture | Action |
|---------|--------|
| Tap a task | Open the task panel |
| Tap the circle | Complete / uncomplete a task |
| Tap a field in the task panel | Edit it |

There are no swipe gestures, long-press selection or pull-to-refresh. Changes from other people arrive live, and reloading the page also refreshes.

## Adding Tasks

Tap the **+** in the header to open Quick Add. It understands the same words as on desktop (`tomorrow`, `p1`, `#project`, `@label` and so on). You can also use **+ Add task** at the bottom of any list.

## Limitations on Mobile

- Drag-and-drop (reordering, moving between board columns, rescheduling in Upcoming and the calendar) is built for a mouse and isn't tuned for touch. To reschedule on a phone, open the task and change its due date.
- The quick buttons that appear when you hover over a task row (due date, priority, **⋯** menu) aren't reliably reachable by touch. Open the task instead. Deleting is at the bottom of the task panel.
- The Board view scrolls sideways on narrow screens. The calendar fits all seven days on screen, so it's cramped on a phone.
- Keyboard shortcuts need a hardware keyboard.

## Browser Compatibility

Taskflow works in current mobile browsers such as Safari on iOS and Chrome on Android.

## Installing

Taskflow can be installed like an app:

- **iPhone and iPad (Safari):** tap **Share → Add to Home Screen**.
- **Android (Chrome):** tap **⋮ → Install app** (or accept the install prompt).
- **Desktop (Chrome, Edge):** click the install icon at the end of the address bar.

The installed app opens in its own window, starting on Today.

## Offline

Once you've opened Taskflow on a device, it opens without a connection too. It shows what you last loaded on that device (pages you've visited in the last three days) with a banner saying you're offline. You can read, but changes aren't saved until you're back online; a change you try to make offline is undone with a message saying why. Pages you haven't visited won't have anything to show.

Signing out removes the saved copy from the device.

## Push Notifications

Browser push notifications work in browsers that support web push, once your administrator has configured push. Turn them on at **Settings → Notifications**. On iPhone and iPad, Safari only offers web push to web apps installed to the home screen, so install Taskflow first.
