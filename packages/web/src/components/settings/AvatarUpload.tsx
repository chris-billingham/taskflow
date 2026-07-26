import { useState } from 'react';
import { Camera, X } from 'lucide-react';

interface AvatarUploadProps {
  name: string;
  avatarUrl?: string | null;
  onSave: (url: string | null) => void;
}

export function AvatarUpload({ name, avatarUrl, onSave }: AvatarUploadProps) {
  const [editing, setEditing] = useState(false);
  const [urlInput, setUrlInput] = useState(avatarUrl ?? '');

  const initials = name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const handleSave = () => {
    onSave(urlInput.trim() || null);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-4">
      <div className="relative group">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 dark:border-gray-700"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-[#db4c3f] flex items-center justify-center text-white text-xl font-semibold">
            {initials}
          </div>
        )}
        <button
          onClick={() => { setUrlInput(avatarUrl ?? ''); setEditing(true); }}
          className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Camera className="w-5 h-5 text-white" />
        </button>
      </div>

      <div>
        <button
          onClick={() => { setUrlInput(avatarUrl ?? ''); setEditing(true); }}
          className="text-sm font-medium text-[#db4c3f] hover:text-[#c53727]"
        >
          Change avatar
        </button>
        {avatarUrl && (
          <>
            <span className="text-gray-300 dark:text-gray-600 mx-2">·</span>
            <button
              onClick={() => onSave(null)}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              Remove
            </button>
          </>
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Enter an image URL</p>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/40" onClick={() => setEditing(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Change Avatar</h3>
              <button onClick={() => setEditing(false)}>
                <X className="w-5 h-5 text-gray-400 dark:text-gray-500" />
              </button>
            </div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Image URL</label>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#db4c3f] focus:border-transparent"
              autoFocus
            />
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleSave}
                className="flex-1 px-4 py-2 bg-[#db4c3f] text-white rounded-lg text-sm font-medium hover:bg-[#c53727]"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
