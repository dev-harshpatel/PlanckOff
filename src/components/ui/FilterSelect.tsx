import React from 'react';
import { Filter } from 'lucide-react';

interface FilterSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: { value: string; label: string }[];
    showIcon?: boolean;
}

export const FilterSelect: React.FC<FilterSelectProps> = ({
    label,
    options,
    showIcon = true,
    className = '',
    ...props
}) => {
    return (
        <div className="flex items-center gap-2">
            {showIcon && <Filter className="w-4 h-4 text-slate-400" />}
            {label && <span className="text-xs text-slate-500">{label}</span>}
            <select
                className={`
                    bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-lg
                    focus:ring-blue-500 focus:border-blue-500 block p-2
                    ${className}
                `.trim().replace(/\s+/g, ' ')}
                {...props}
            >
                {options.map(option => (
                    <option key={option.value} value={option.value}>
                        {option.label}
                    </option>
                ))}
            </select>
        </div>
    );
};
