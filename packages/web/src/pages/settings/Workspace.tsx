import { useParams } from 'react-router';
import { WorkspaceSettings } from '@/components/workspace/WorkspaceSettings';

export default function WorkspaceSettingsPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="p-6">
      <WorkspaceSettings workspaceId={id} />
    </div>
  );
}
