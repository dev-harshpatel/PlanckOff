import React from 'react';
import { X } from 'lucide-react';

type CloseButtonSize = 'sm' | 'md';
type CloseButtonVariant = 'default' | 'light';

interface CloseButtonProps {
    onClick: () => void;
    size?: CloseButtonSize;
    variant?: CloseButtonVariant;
    className?: string;
    tooltip?: string;
}

const sizeStyles: Record<CloseButtonSize, { button: string; icon: string }> = {
    sm: { button: 'p-1', icon: 'w-4 h-4' },
    md: { button: 'p-1.5', icon: 'w-5 h-5' },
};

const variantStyles: Record<CloseButtonVariant, string> = {
    default: 'text-slate-400 hover:text-slate-600 hover:bg-slate-100',
    light: 'text-white/80 hover:text-white hover:bg-white/10',
};

export const CloseButton: React.FC<CloseButtonProps> = ({
    onClick,
    size = 'sm',
    variant = 'default',
    className = '',
    tooltip = 'Close',
}) => {
    return (
        <button
            onClick={onClick}
            className={`
                rounded-full transition-colors
                ${sizeStyles[size].button}
                ${variantStyles[variant]}
                ${className}
            `.trim().replace(/\s+/g, ' ')}
            title={tooltip}
            aria-label={tooltip}
        >
            <X className={sizeStyles[size].icon} />
        </button>
    );
};
