'use client';

import { cn, getInitials, generateAvatarColor } from '@/lib/utils';

interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

export default function Avatar({ name, imageUrl, size = 'md', className }: AvatarProps) {
  const initials = getInitials(name);
  const bgColor = generateAvatarColor(name);

  const sizeClasses = {
    xs: 'w-6 h-6 text-[10px]',
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-14 h-14 text-lg',
    xl: 'w-20 h-20 text-2xl',
  };

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt={name}
        className={cn(
          'rounded-full object-cover',
          sizeClasses[size],
          className
        )}
      />
    );
  }

  return (
    <div
      className={cn(
        'rounded-full flex items-center justify-center font-bold text-white',
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: bgColor }}
    >
      {initials}
    </div>
  );
}