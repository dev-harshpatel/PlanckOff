import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
    icon?: LucideIcon;
    title: string;
    description?: string;
    action?: React.ReactNode;
    className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
    icon: Icon = Inbox,
    title,
    description,
    action,
    className = '',
}) => {
    return (
        <div className={`py-12 text-center ${className}`}>
            <Icon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-600 mb-2">{title}</h3>
            {description && (
                <p className="text-sm text-slate-400 max-w-sm mx-auto mb-4">{description}</p>
            )}
            {action}
        </div>
    );
};
