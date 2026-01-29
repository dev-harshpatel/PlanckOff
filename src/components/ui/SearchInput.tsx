import React from 'react';
import { Search, X } from 'lucide-react';

interface SearchInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
    value: string;
    onValueChange: (value: string) => void;
    showClear?: boolean;
}

export const SearchInput: React.FC<SearchInputProps> = ({
    value,
    onValueChange,
    showClear = true,
    className = '',
    placeholder = 'Search...',
    ...props
}) => {
    return (
        <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
                type="text"
                value={value}
                onChange={(e) => onValueChange(e.target.value)}
                placeholder={placeholder}
                className={`
                    w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm
                    focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white
                    transition-all
                    ${className}
                `.trim().replace(/\s+/g, ' ')}
                {...props}
            />
            {showClear && value && (
                <button
                    type="button"
                    onClick={() => onValueChange('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            )}
        </div>
    );
};
