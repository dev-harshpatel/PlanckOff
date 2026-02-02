import React from 'react';
import { Filter } from 'lucide-react';

import { Select } from './Select';

interface FilterSelectProps {
    className?: string;
    disabled?: boolean;
    options: { value: string; label: string }[];
    showIcon?: boolean;
    value: string;
    label?: string;
    onValueChange: (value: string) => void;
}

export const FilterSelect: React.FC<FilterSelectProps> = ({
    className = '',
    disabled = false,
    label,
    onValueChange,
    options,
    showIcon = true,
    value
}) => {
    return (
        <Select
            containerClassName="w-auto"
            disabled={disabled}
            icon={showIcon ? Filter : undefined}
            options={options}
            size="sm"
            variant="filter"
            value={value}
            className={className}
            onValueChange={onValueChange}
            aria-label={label || 'Filter'}
        />
    );
};
