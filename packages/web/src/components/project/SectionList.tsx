import { useState } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus } from 'lucide-react';
import { SectionHeader } from './SectionHeader';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import type { ProjectSection } from '@/types/project';
import type { ReactNode } from 'react';

interface SectionListProps {
  sections: ProjectSection[];
  onCreateSection: (name: string) => Promise<unknown>;
  onUpdateSection: (
    id: string,
    data: Partial<{ name: string; isCollapsed: boolean }>,
  ) => Promise<unknown>;
  onDeleteSection: (id: string) => Promise<void>;
  renderSectionContent?: (section: ProjectSection) => ReactNode;
}

function SortableSectionItem({
  section,
  onUpdate,
  onDelete,
  renderContent,
}: {
  section: ProjectSection;
  onUpdate: (
    id: string,
    data: Partial<{ name: string; isCollapsed: boolean }>,
  ) => Promise<unknown>;
  onDelete: (id: string) => Promise<void>;
  renderContent?: (section: ProjectSection) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: section.id,
    data: { type: 'section' },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <SectionHeader
        section={section}
        dragHandleProps={{ ...attributes, ...listeners }}
        onUpdateName={(name) => onUpdate(section.id, { name })}
        onToggleCollapse={() =>
          onUpdate(section.id, { isCollapsed: !section.isCollapsed })
        }
        onDelete={() => onDelete(section.id)}
      />
      {!section.isCollapsed && (
        renderContent ? renderContent(section) : (
          <div className="pl-7 py-2">
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">No tasks yet</p>
          </div>
        )
      )}
    </div>
  );
}

export function SectionList({
  sections,
  onCreateSection,
  onUpdateSection,
  onDeleteSection,
  renderSectionContent,
}: SectionListProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAddSection = async () => {
    if (!newName.trim()) return;
    setIsSubmitting(true);
    try {
      await onCreateSection(newName.trim());
      setNewName('');
      setIsAdding(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const sectionIds = sections.map((s) => s.id);

  return (
    <div>
      {/* Sections sort inside the project page's drag context, which also
          lets tasks move between them. */}
        <SortableContext
          items={sectionIds}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {sections.map((section) => (
              <SortableSectionItem
                key={section.id}
                section={section}
                onUpdate={onUpdateSection}
                onDelete={onDeleteSection}
                renderContent={renderSectionContent}
              />
            ))}
          </div>
        </SortableContext>

      {/* Add section */}
      {isAdding ? (
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Section name"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddSection();
              if (e.key === 'Escape') {
                setIsAdding(false);
                setNewName('');
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleAddSection}
            isLoading={isSubmitting}
            disabled={!newName.trim()}
          >
            Add
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setIsAdding(false);
              setNewName('');
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <button
          className="mt-3 flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-500 transition-colors"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="w-4 h-4" />
          Add section
        </button>
      )}
    </div>
  );
}
