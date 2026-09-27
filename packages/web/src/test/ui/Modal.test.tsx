import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Modal } from '@/components/ui/Modal';
import { Sheet } from '@/components/ui/Sheet';

function Stacked() {
  const [outer, setOuter] = useState(true);
  const [inner, setInner] = useState(false);
  return (
    <>
      <Modal isOpen={outer} onClose={() => setOuter(false)} ariaLabel="Gallery">
        <button onClick={() => setInner(true)}>Preview</button>
      </Modal>
      <Modal isOpen={inner} onClose={() => setInner(false)} title="Preview">
        <input aria-label="Name" autoFocus />
      </Modal>
    </>
  );
}

describe('Modal', () => {
  it('Escape closes only the topmost of stacked dialogs, and focus returns to its opener', async () => {
    const user = userEvent.setup();
    render(<Stacked />);
    const gallery = screen.getByRole('dialog', { name: 'Gallery' });
    expect(gallery).toHaveAttribute('aria-modal', 'true');

    const opener = screen.getByRole('button', { name: 'Preview' });
    await user.click(opener);
    // autoFocus wins over the header's Close button.
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Gallery' })).toBeInTheDocument();
    expect(opener).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('keeps the page scroll-locked until the last stacked dialog closes', async () => {
    const user = userEvent.setup();
    render(<Stacked />);
    await user.click(screen.getByRole('button', { name: 'Preview' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.body.style.overflow).toBe('hidden');
    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });

  it('a dialog opened from a sheet takes Escape first', async () => {
    const user = userEvent.setup();
    function SheetWithDialog() {
      const [sheet, setSheet] = useState(true);
      const [dialog, setDialog] = useState(true);
      return sheet ? (
        <Sheet onClose={() => setSheet(false)} label="Task detail">
          <Modal isOpen={dialog} onClose={() => setDialog(false)} ariaLabel="Image preview">
            <p>image</p>
          </Modal>
        </Sheet>
      ) : null;
    }
    render(<SheetWithDialog />);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Task detail' })).toBeInTheDocument();
  });
});
