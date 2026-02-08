'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500 dark:bg-green-600 dark:hover:bg-green-700':
              variant === 'primary',
            'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-400 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600':
              variant === 'secondary',
            'bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800 focus:ring-gray-400':
              variant === 'ghost',
            'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500':
              variant === 'danger',
            'text-white hover:opacity-90 focus:ring-green-500':
              variant === 'accent',
          },
          {
            'text-sm px-3 py-1.5': size === 'sm',
            'text-sm px-4 py-2': size === 'md',
            'text-base px-6 py-3': size === 'lg',
            'text-lg px-8 py-4': size === 'xl',
          },
          className
        )}
        style={variant === 'accent' ? { backgroundColor: 'var(--accent-color)' } : undefined}
        {...props}
      >
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';

export default Button;
