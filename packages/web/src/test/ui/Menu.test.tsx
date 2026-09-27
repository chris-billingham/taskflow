import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/Menu';
import { Sheet } from '@/components/ui/Sheet';

function renderMenu(onRowClick = vi.fn()) {
  const edit = vi.fn();
  const remove = vi.fn();
  render(
    <div onClick={onRowClick}>
      <Menu label="Task options" trigger={<span>⋯</span>}>
        <MenuItem onSelect={edit}>Edit</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={remove} tone="danger">
          Delete
        </MenuItem>
      </Menu>
      <p>Outside</p>
    </div>,
  );
  return { edit, remove, onRowClick };
}

describe('Menu', () => {
  it('opens from a labelled trigger, focuses the first item, and runs the chosen action', async () => {
    const user = userEvent.setup();
    const { edit, onRowClick } = renderMenu();
    const trigger = screen.getByRole('button', { name: 'Task options' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(screen.getByRole('menu', { name: 'Task options' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();

    await user.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(edit).toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    // Clicks inside the menu never reach the row behind it.
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it('moves with the arrow keys and closes on Escape, returning focus', async () => {
    const user = userEvent.setup();
    const { remove } = renderMenu();
    const trigger = screen.getByRole('button', { name: 'Task options' });

    trigger.focus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Edit' })).toHaveFocus();
    await user.keyboard('{End}{Enter}');
    expect(remove).toHaveBeenCalled();

    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('closes on a click outside', async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole('button', { name: 'Task options' }));
    await user.click(screen.getByText('Outside'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('Sheet', () => {
  it('is a labelled modal dialog that closes on Escape, but not when a menu inside handled it', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(
      <Sheet onClose={onClose} label="Task detail">
        <Menu label="More" trigger={<span>⋯</span>}>
          <MenuItem onSelect={() => {}}>Thing</MenuItem>
        </Menu>
      </Sheet>,
    );
    expect(screen.getByRole('dialog', { name: 'Task detail' })).toHaveAttribute('aria-modal', 'true');

    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
