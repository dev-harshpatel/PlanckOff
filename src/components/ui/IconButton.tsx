import React from 'react';
import { LucideIcon } from 'lucide-react';

type IconButtonVariant = 'default' | 'primary' | 'danger' | 'success';
type IconButtonSize = 'sm' | 'md' | 'lg';

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    icon: LucideIcon;
    variant?: IconButtonVariant;
    size?: IconButtonSize;
    tooltip?: string;
}

const variantStyles: Record<IconButtonVariant, string> = {
    default: 'text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:bg-slate-200',
    primary: 'text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 active:bg-emerald-100',
    danger: 'text-slate-500 hover:text-red-600 hover:bg-red-50 active:bg-red-100',
    success: 'text-slate-500 hover:text-blue-600 hover:bg-blue-50 active:bg-blue-100',
};

const sizeStyles: Record<IconButtonSize, { button: string; icon: string }> = {
    sm: { button: 'p-1', icon: 'w-3.5 h-3.5' },
    md: { button: 'p-1.5', icon: 'w-4 h-4' },
    lg: { button: 'p-2', icon: 'w-5 h-5' },
};

export const IconButton: React.FC<IconButtonProps> = ({
    icon: Icon,
    variant = 'default',
    size = 'md',
    tooltip,
    className = '',
    ...props
}) => {
    return (
        <button
            className={`
                rounded-lg transition-colors
                ${variantStyles[variant]}
                ${sizeStyles[size].button}
                ${className}
            `.trim().replace(/\s+/g, ' ')}
            title={tooltip}
            {...props}
        >
            <Icon className={sizeStyles[size].icon} />
        </button>
    );
};
