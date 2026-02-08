interface PageWrapperProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export default function PageWrapper({ children, title, subtitle, action }: PageWrapperProps) {
  return (
    <div className="min-h-screen pb-20 pt-2">
      <div className="max-w-lg mx-auto px-4">
        {(title || action) && (
          <div className="flex items-start justify-between mb-4 mt-2">
            <div>
              {title && (
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
              )}
              {subtitle && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>
              )}
            </div>
            {action}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
