import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeadlineBadge } from '@/components/task/DueDatePicker';

const ymd = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('DeadlineBadge', () => {
  it('says it is a deadline, and turns red once it has passed', () => {
    const { container, rerender } = render(<DeadlineBadge deadline={ymd(3)} />);
    expect(screen.getByText(/Deadline/)).toBeInTheDocument();
    expect(container.firstElementChild?.className).toContain('text-gray-500');
    rerender(<DeadlineBadge deadline={ymd(0)} />);
    expect(container.firstElementChild?.className).toContain('text-orange-600');
    rerender(<DeadlineBadge deadline={ymd(-1)} />);
    expect(container.firstElementChild?.className).toContain('text-red-600');
  });

  it('shows nothing without a deadline', () => {
    const { container } = render(<DeadlineBadge deadline={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
