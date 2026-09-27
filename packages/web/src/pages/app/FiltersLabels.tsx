import { Tag, Filter } from 'lucide-react';
import { LabelManager } from '@/components/label/LabelManager';
import { FilterEditor } from '@/components/filter/FilterEditor';

export default function FiltersLabels() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Filters & Labels</h1>

      {/* Filters section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
          <Filter className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Filters
          </h2>
        </div>
        <FilterEditor />
      </div>

      {/* Labels section */}
      <div>
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
          <Tag className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Labels
          </h2>
        </div>
        <LabelManager />
      </div>
    </div>
  );
}
