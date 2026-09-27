import { createContext, useContext, type ComponentProps } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Tick or untick the checklist item whose list item starts at `offset` in the
 * Markdown source. Returns the source unchanged if there is no checkbox there.
 */
export function toggleChecklistItem(source: string, offset: number): string {
  const match = /^([ \t]*(?:[-*+]|\d+[.)])[ \t]+)\[([ xX])\]/.exec(source.slice(offset));
  if (!match) return source;
  const at = offset + match[1].length + 1;
  const next = match[2] === ' ' ? 'x' : ' ';
  return source.slice(0, at) + next + source.slice(at + 1);
}

// Each checklist item tells its checkbox where it starts in the source.
const ItemOffset = createContext<number | null>(null);
const ToggleItem = createContext<((offset: number) => void) | null>(null);

const components: Components = {
  // Links leave the app; they never navigate the task panel away.
  a: ({ node: _node, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} />
  ),
  li: ({ node, children, ...props }) => (
    <ItemOffset.Provider value={node?.position?.start.offset ?? null}>
      <li {...props}>{children}</li>
    </ItemOffset.Provider>
  ),
  input: function ChecklistBox({ node: _node, ...props }: ComponentProps<'input'> & { node?: unknown }) {
    const offset = useContext(ItemOffset);
    const toggle = useContext(ToggleItem);
    if (props.type !== 'checkbox') return <input {...props} />;
    const canToggle = toggle !== null && offset !== null;
    return (
      <input
        type="checkbox"
        checked={Boolean(props.checked)}
        disabled={!canToggle}
        aria-label={props.checked ? 'Done' : 'Not done'}
        className="mr-1.5 align-middle accent-primary-500"
        onClick={(e) => e.stopPropagation()}
        onChange={() => canToggle && toggle(offset)}
      />
    );
  },
};

interface MarkdownProps {
  children: string;
  className?: string;
  /** Makes checklist items clickable; receives the updated source. */
  onChange?: (source: string) => void;
}

/**
 * Markdown as Taskflow renders it: GitHub-flavoured (checklists, tables,
 * strikethrough, bare links), no raw HTML, links in a new tab.
 */
export function Markdown({ children, className = '', onChange }: MarkdownProps) {
  return (
    <ToggleItem.Provider value={onChange ? (offset) => onChange(toggleChecklistItem(children, offset)) : null}>
      <div
        className={`prose prose-sm dark:prose-invert max-w-none break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-li:my-0.5 [&_.contains-task-list]:pl-0 [&_.task-list-item]:list-none ${className}`}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {children}
        </ReactMarkdown>
      </div>
    </ToggleItem.Provider>
  );
}
