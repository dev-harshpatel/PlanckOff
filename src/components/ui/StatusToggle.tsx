'use client';

import React from 'react';

interface StatusToggleProps {
    options: string[];
    value: string;
    onChange: (value: string) => void;
    className?: string;
}

export const StatusToggle: React.FC<StatusToggleProps> = ({
    options,
    value,
    onChange,
    className = ''
}) => {
    return (
        <div className={`flex bg-slate-100 p-1 rounded-lg ${className}`}>
            {options.map((option) => (
                <button
                    key={option}
                    type="button"
                    onClick={() => onChange(option)}
                    className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-all ${
                        value === option
                            ? 'bg-white text-emerald-700 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    {option}
                </button>
            ))}
        </div>
    );
};
