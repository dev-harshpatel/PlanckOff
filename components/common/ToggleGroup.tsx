import React from 'react';

interface ToggleOption<T extends string> {
    value: T;
    label: string;
}

interface ToggleGroupProps<T extends string> {
    options: ToggleOption<T>[];
    value: T;
    onChange: (value: T) => void;
    size?: 'sm' | 'md';
    className?: string;
}

export function ToggleGroup<T extends string>({
    options,
    value,
    onChange,
    size = 'md',
    className = '',
}: ToggleGroupProps<T>) {
    const sizeStyles = {
        sm: 'text-xs py-1',
        md: 'text-xs py-1.5',
    };

    return (
        <div className={`flex bg-slate-100 p-1 rounded-lg ${className}`}>
            {options.map((option) => (
                <button
                    key={option.value}
                    type="button"
                    onClick={() => onChange(option.value)}
                    className={`
                        flex-1 font-medium rounded-md transition-all
                        ${sizeStyles[size]}
                        ${value === option.value
                            ? 'bg-white text-emerald-700 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }
                    `.trim().replace(/\s+/g, ' ')}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
}
