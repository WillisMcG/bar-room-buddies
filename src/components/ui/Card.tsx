import { cn } from '@/lib/utils';
import { type HTMLAttributes } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export default function Card({ className, padding = 'md', children, ...props }: CardProps) {
  return (
    <div
      className={cn(
        'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm',
        {
          '': padding === 'none',
          'p-3': padding === 'sm',
          'p-4 sm:p-6': padding === 'md',
          'p-6 sm:p-8': padding === 'lg',
        },
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
