import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** What the button does, for screen readers and the hover tooltip. Required. */
  label: string;
  children: ReactNode;
  size?: 'sm' | 'md';
  tone?: 'default' | 'danger';
}

/** A button that shows only an icon, always with an accessible name. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ label, children, size = 'md', tone = 'default', className = '', type = 'button', ...props }, ref) => {
    const sizes = { sm: 'p-1', md: 'p-1.5' };
    const tones = {
      default:
        'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 hover:text-gray-600 dark:hover:text-gray-300',
      danger: 'text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600',
    };
    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        title={label}
        className={`inline-flex items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50 ${sizes[size]} ${tones[tone]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  },
);

IconButton.displayName = 'IconButton';
