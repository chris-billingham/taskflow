import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ProjectItem } from './ProjectItem';
import type { ProjectTreeNode } from '@/stores/projectStore';
import { useProjectStore } from '@/stores/projectStore';

interface ProjectListProps {
  projects: ProjectTreeNode[];
  onEdit: (project: ProjectTreeNode) => void;
  onDelete: (project: ProjectTreeNode) => void;
}

function SortableProjectItem({
  project,
  onEdit,
  onDelete,
  onArchive,
  onDuplicate,
  onToggleFavorite,
}: {
  project: ProjectTreeNode;
  onEdit: (p: ProjectTreeNode) => void;
  onDelete: (p: ProjectTreeNode) => void;
  onArchive: (p: ProjectTreeNode) => void;
  onDuplicate: (p: ProjectTreeNode) => void;
  onToggleFavorite: (p: ProjectTreeNode) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ProjectItem
        project={project}
        onEdit={onEdit}
        onDelete={onDelete}
        onArchive={onArchive}
        onDuplicate={onDuplicate}
        onToggleFavorite={onToggleFavorite}
      />
    </div>
  );
}

export function ProjectList({ projects, onEdit, onDelete }: ProjectListProps) {
  const updateProject = useProjectStore((s) => s.updateProject);
  const archiveProject = useProjectStore((s) => s.archiveProject);
  const unarchiveProject = useProjectStore((s) => s.unarchiveProject);
  const duplicateProject = useProjectStore((s) => s.duplicateProject);
  const reorderProjects = useProjectStore((s) => s.reorderProjects);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const rootProjects = projects.filter((p) => !p.parentId);
    const ids = rootProjects.map((p) => p.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);

    if (oldIndex === -1 || newIndex === -1) return;

    const newIds = [...ids];
    newIds.splice(oldIndex, 1);
    newIds.splice(newIndex, 0, active.id as string);
    reorderProjects(newIds);
  };

  const handleArchive = async (project: ProjectTreeNode) => {
    if (project.isArchived) {
      await unarchiveProject(project.id);
    } else {
      await archiveProject(project.id);
    }
  };

  const handleDuplicate = async (project: ProjectTreeNode) => {
    await duplicateProject(project.id);
  };

  const handleToggleFavorite = async (project: ProjectTreeNode) => {
    await updateProject(project.id, { isFavorite: !project.isFavorite });
  };

  const rootIds = projects.filter((p) => !p.parentId).map((p) => p.id);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={rootIds} strategy={verticalListSortingStrategy}>
        <div className="space-y-0.5">
          {projects
            .filter((p) => !p.parentId)
            .map((project) => (
              <SortableProjectItem
                key={project.id}
                project={project}
                onEdit={onEdit}
                onDelete={onDelete}
                onArchive={handleArchive}
                onDuplicate={handleDuplicate}
                onToggleFavorite={handleToggleFavorite}
              />
            ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
