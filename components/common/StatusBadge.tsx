import React from 'react';

type StatusType =
    | 'Working Project Progress'
    | 'Under Review'
    | 'Submitted'
    | 'Hold'
    | 'Archive'
    | 'Active'
    | 'Invited'
    | 'success'
    | 'warning'
    | 'error'
    | 'info'
    | 'default';

interface StatusBadgeProps {
    status: StatusType | string;
    size?: 'sm' | 'md';
    className?: string;
    onClick?: () => void;
}

const getStatusColor = (status: string): string => {
    switch (status) {
        case 'Working Project Progress':
        case 'Active':
        case 'success':
            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
        case 'Under Review':
        case 'warning':
            return 'bg-amber-50 text-amber-700 border-amber-200';
        case 'Submitted':
        case 'info':
            return 'bg-blue-50 text-blue-700 border-blue-200';
        case 'Hold':
        case 'Invited':
        case 'default':
            return 'bg-slate-50 text-slate-600 border-slate-200';
        case 'Archive':
            return 'bg-purple-50 text-purple-700 border-purple-200';
        case 'error':
            return 'bg-red-50 text-red-700 border-red-200';
        default:
            return 'bg-slate-50 text-slate-600 border-slate-200';
    }
};

const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({
    status,
    size = 'md',
    className = '',
    onClick,
}) => {
    return (
        <span
            onClick={onClick}
            className={`
                inline-flex items-center rounded-full font-semibold border
                ${sizeStyles[size]}
                ${getStatusColor(status)}
                ${onClick ? 'cursor-pointer select-none' : ''}
                ${className}
            `.trim().replace(/\s+/g, ' ')}
            title={onClick ? 'Double click to change status' : undefined}
        >
            {status}
        </span>
    );
};
