import { Modal } from '@/components/ui/Modal';

/** Every shortcut in one place; also documented in docs/user-guide/keyboard-shortcuts.md. */
export const SHORTCUT_GROUPS: Array<{ title: string; items: Array<[keys: string[], action: string]> }> = [
  {
    title: 'Anywhere',
    items: [
      [['⌘', 'K'], 'Command palette (Ctrl+K on Windows and Linux)'],
      [['Q'], 'Add a task'],
      [['/'], 'Search'],
      [['?'], 'This list of shortcuts'],
    ],
  },
  {
    title: 'Task lists',
    items: [
      [['J'], 'Next task'],
      [['K'], 'Previous task'],
      [['Enter'], 'Open the task'],
      [['E'], 'Rename it'],
      [['C'], 'Complete it (or reopen)'],
      [['T'], 'Set its due date'],
      [['1', '–', '4'], 'Set its priority'],
      [['X'], 'Select it (for acting on several)'],
      [['D'], 'Delete it (to the Trash)'],
      [['Esc'], 'Clear the selection'],
    ],
  },
  {
    title: 'Task panel and dialogs',
    items: [[['Esc'], 'Close']],
  },
];

export function ShortcutsSheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Keyboard shortcuts" size="md">
      <div className="px-6 py-4 space-y-5 max-h-[70vh] overflow-y-auto">
        {SHORTCUT_GROUPS.map((group) => (
          <section key={group.title}>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
              {group.title}
            </h4>
            <dl className="space-y-1.5">
              {group.items.map(([keys, action]) => (
                <div key={action} className="flex items-center justify-between gap-4 text-sm">
                  <dt className="text-gray-700 dark:text-gray-300">{action}</dt>
                  <dd className="flex items-center gap-1 shrink-0">
                    {keys.map((k) =>
                      k === '–' ? (
                        <span key={k} className="text-gray-400">–</span>
                      ) : (
                        <kbd
                          key={k}
                          className="min-w-[1.5rem] text-center px-1.5 py-0.5 text-xs font-mono rounded-sm border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-200"
                        >
                          {k}
                        </kbd>
                      ),
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </Modal>
  );
}
