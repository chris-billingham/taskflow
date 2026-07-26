import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecurrencePicker } from '@/components/task/RecurrencePicker';

const onChange = vi.fn();

beforeEach(() => {
  onChange.mockClear();
});

function open() {
  fireEvent.click(screen.getByRole('button', { name: /does not repeat|every/i }));
}

describe('RecurrencePicker — display', () => {
  it('shows "Does not repeat" for a one-off task', () => {
    render(
      <RecurrencePicker isRecurring={false} recurrenceRule={null} onChange={onChange} />,
    );
    expect(screen.getByText('Does not repeat')).toBeInTheDocument();
  });

  it('summarises an active rule', () => {
    render(
      <RecurrencePicker
        isRecurring
        recurrenceRule="FREQ=WEEKLY;INTERVAL=1;BYDAY=MO"
        onChange={onChange}
      />,
    );
    expect(screen.getByText('Every Monday')).toBeInTheDocument();
  });

  it('treats isRecurring=false as not repeating even if a stale rule remains', () => {
    // The flag is what the completion path checks, so it wins over the rule.
    render(
      <RecurrencePicker
        isRecurring={false}
        recurrenceRule="FREQ=DAILY;INTERVAL=1"
        onChange={onChange}
      />,
    );
    expect(screen.getByText('Does not repeat')).toBeInTheDocument();
  });

  it('offers a clear button only when a series is active', () => {
    const { rerender } = render(
      <RecurrencePicker isRecurring={false} recurrenceRule={null} onChange={onChange} />,
    );
    expect(screen.queryByLabelText('Stop repeating')).not.toBeInTheDocument();

    rerender(
      <RecurrencePicker
        isRecurring
        recurrenceRule="FREQ=DAILY;INTERVAL=1"
        onChange={onChange}
      />,
    );
    expect(screen.getByLabelText('Stop repeating')).toBeInTheDocument();
  });
});

describe('RecurrencePicker — editing', () => {
  it('applies a preset', () => {
    render(
      <RecurrencePicker isRecurring={false} recurrenceRule={null} onChange={onChange} />,
    );
    open();
    fireEvent.click(screen.getByText('Every weekday'));

    expect(onChange).toHaveBeenCalledWith('FREQ=WEEKLY;INTERVAL=1;BYDAY=MO,TU,WE,TH,FR');
  });

  it('clears the series with null so the caller can unset isRecurring', () => {
    render(
      <RecurrencePicker
        isRecurring
        recurrenceRule="FREQ=DAILY;INTERVAL=1"
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByLabelText('Stop repeating'));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('clears from the dropdown too', () => {
    render(
      <RecurrencePicker
        isRecurring
        recurrenceRule="FREQ=DAILY;INTERVAL=1"
        onChange={onChange}
      />,
    );
    open();
    fireEvent.click(screen.getByText('Does not repeat'));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('builds a custom interval rule', () => {
    render(
      <RecurrencePicker isRecurring={false} recurrenceRule={null} onChange={onChange} />,
    );
    open();
    fireEvent.click(screen.getByText('Custom…'));

    fireEvent.change(screen.getByLabelText('Repeat interval'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Repeat unit'), { target: { value: 'MONTHLY' } });
    fireEvent.click(screen.getByText('Save'));

    expect(onChange).toHaveBeenCalledWith('FREQ=MONTHLY;INTERVAL=3');
  });

  it('offers weekday toggles only for weekly rules', () => {
    render(
      <RecurrencePicker isRecurring={false} recurrenceRule={null} onChange={onChange} />,
    );
    open();
    fireEvent.click(screen.getByText('Custom…'));

    // Defaults to WEEKLY, so the day buttons are present.
    expect(screen.getByLabelText('MO')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Repeat unit'), { target: { value: 'YEARLY' } });
    expect(screen.queryByLabelText('MO')).not.toBeInTheDocument();
  });

  it('includes selected weekdays in the saved rule', () => {
    render(
      <RecurrencePicker isRecurring={false} recurrenceRule={null} onChange={onChange} />,
    );
    open();
    fireEvent.click(screen.getByText('Custom…'));
    fireEvent.click(screen.getByLabelText('TU'));
    fireEvent.click(screen.getByLabelText('TH'));
    fireEvent.click(screen.getByText('Save'));

    expect(onChange).toHaveBeenCalledWith('FREQ=WEEKLY;INTERVAL=1;BYDAY=TU,TH');
  });

  it('seeds the custom editor from the existing rule', () => {
    render(
      <RecurrencePicker
        isRecurring
        recurrenceRule="FREQ=WEEKLY;INTERVAL=2;BYDAY=FR"
        onChange={onChange}
      />,
    );
    open();
    fireEvent.click(screen.getByText('Custom…'));

    expect(screen.getByLabelText('Repeat interval')).toHaveValue(2);
    expect(screen.getByLabelText('Repeat unit')).toHaveValue('WEEKLY');
    expect(screen.getByLabelText('FR')).toHaveAttribute('aria-pressed', 'true');
  });

  it('clamps a nonsense interval rather than emitting an invalid rule', () => {
    render(
      <RecurrencePicker isRecurring={false} recurrenceRule={null} onChange={onChange} />,
    );
    open();
    fireEvent.click(screen.getByText('Custom…'));
    fireEvent.change(screen.getByLabelText('Repeat interval'), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Save'));

    expect(onChange).toHaveBeenCalledWith('FREQ=WEEKLY;INTERVAL=1');
  });

  it('cancelling the custom editor changes nothing', () => {
    render(
      <RecurrencePicker isRecurring={false} recurrenceRule={null} onChange={onChange} />,
    );
    open();
    fireEvent.click(screen.getByText('Custom…'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('previews the rule being built', () => {
    render(
      <RecurrencePicker isRecurring={false} recurrenceRule={null} onChange={onChange} />,
    );
    open();
    fireEvent.click(screen.getByText('Custom…'));
    fireEvent.change(screen.getByLabelText('Repeat interval'), { target: { value: '2' } });

    expect(screen.getByText('Every 2 weeks')).toBeInTheDocument();
  });
});
