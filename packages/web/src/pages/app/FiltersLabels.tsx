import { useEffect } from 'react';
import { Tag, Filter } from 'lucide-react';
import { LabelManager } from '@/components/label/LabelManager';
import { FilterEditor } from '@/components/filter/FilterEditor';
import { useLabelStore } from '@/stores/labelStore';
import { useFilterStore } from '@/stores/filterStore';

export default function FiltersLabels() {
  const fetchLabels = useLabelStore((s) => s.fetchLabels);
  const fetchFilters = useFilterStore((s) => s.fetchFilters);

  useEffect(() => {
    fetchLabels();
    fetchFilters();
  }, [fetchLabels, fetchFilters]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Filters & Labels</h1>

      {/* Filters section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
          <Filter className="w-5 h-5 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Filters
          </h2>
        </div>
        <FilterEditor />
      </div>

      {/* Labels section */}
      <div>
        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-200">
          <Tag className="w-5 h-5 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
            Labels
          </h2>
        </div>
        <LabelManager />
      </div>
    </div>
  );
}
