import React from 'react';
import { LucideIcon } from 'lucide-react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    icon?: LucideIcon;
    error?: string;
    helperText?: string;
}

export const Input: React.FC<InputProps> = ({
    label,
    icon: Icon,
    error,
    helperText,
    className = '',
    id,
    ...props
}) => {
    const inputId = id || `input-${label?.toLowerCase().replace(/\s+/g, '-')}`;

    return (
        <div className="w-full">
            {label && (
                <label
                    htmlFor={inputId}
                    className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
                >
                    {label}
                </label>
            )}
            <div className="relative">
                {Icon && (
                    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                )}
                <input
                    id={inputId}
                    className={`
                        w-full py-2.5 bg-slate-50 border rounded-lg text-sm
                        focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white
                        transition-all
                        ${Icon ? 'pl-10 pr-4' : 'px-4'}
                        ${error ? 'border-red-300 focus:ring-red-500' : 'border-slate-200'}
                        ${className}
                    `.trim().replace(/\s+/g, ' ')}
                    {...props}
                />
            </div>
            {error && (
                <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
            {helperText && !error && (
                <p className="mt-1 text-xs text-slate-400">{helperText}</p>
            )}
        </div>
    );
};
