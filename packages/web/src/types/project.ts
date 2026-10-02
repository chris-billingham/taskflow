import type { Project as ContractProject, ProjectFields, Section } from '@taskflow/contract';

export type ProjectSection = Section;

/**
 * A project as the web app handles it. List, detail and mutation responses
 * include sections, counts and children; archive/unarchive return the fields only.
 */
export type Project = ProjectFields & Partial<Pick<ContractProject, 'sections' | '_count' | 'children' | 'access'>>;

export interface ProjectTreeNode extends Project {
  childNodes: ProjectTreeNode[];
}

/** Active projects arranged by parent, each level in its saved order. */
export function buildProjectTree(projects: Project[]): ProjectTreeNode[] {
  const map = new Map<string, ProjectTreeNode>();
  for (const p of projects) {
    if (!p.isArchived) map.set(p.id, { ...p, childNodes: [] });
  }
  const roots: ProjectTreeNode[] = [];
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.childNodes.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: ProjectTreeNode[]) => {
    nodes.sort((a, b) => a.sortOrder - b.sortOrder);
    for (const node of nodes) sortNodes(node.childNodes);
  };
  sortNodes(roots);
  return roots;
}
