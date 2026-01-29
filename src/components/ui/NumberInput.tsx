'use client';

import React, { useState, useEffect } from 'react';
import { Input } from './Input';

interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
    value: number | undefined;
    onChange: (value: number | undefined) => void;
    label?: string;
    error?: string;
    helperText?: string;
    type?: 'float' | 'int';
    scale?: number; // scale factor (e.g. 0.01 for percentage)
    allowNegative?: boolean;
    /** When true, renders a minimal input without wrapper (for table cells) */
    cellMode?: boolean;
}

export const NumberInput: React.FC<NumberInputProps> = ({
    value,
    onChange,
    label,
    error,
    helperText,
    type = 'float',
    scale = 1,
    allowNegative = false,
    cellMode = false,
    className = '',
    placeholder,
    ...props
}) => {
    const [localVal, setLocalVal] = useState<string>(
        value !== undefined ? (value * (type === 'float' && scale !== 1 ? 1 / scale : 1)).toString() : ''
    );

    // Sync with prop when it changes externally
    useEffect(() => {
        const currentParsed = parseFloat(localVal);
        const propVal = value !== undefined ? (value * (type === 'float' && scale !== 1 ? 1 / scale : 1)) : undefined;

        if (propVal !== undefined && propVal !== currentParsed) {
            setLocalVal(propVal.toString());
        } else if (propVal === undefined && localVal !== '') {
            setLocalVal('');
        }
    }, [value, type, scale]);

    const commit = () => {
        if (localVal === '') {
            onChange(undefined);
            return;
        }
        if (localVal === '.' || localVal === '-') return; // ignore invalid

        let num = parseFloat(localVal);
        if (isNaN(num)) return;

        if (type === 'int') num = parseInt(localVal);

        if (scale !== 1) num = num * scale;

        onChange(num);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const v = e.target.value;
        const regex = allowNegative ? /^-?\d*\.?\d*$/ : /^\d*\.?\d*$/;
        if (v === '' || regex.test(v)) {
            setLocalVal(v);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.currentTarget.blur();
        }
    };

    // Cell mode: render minimal input without wrapper
    if (cellMode) {
        return (
            <input
                className={className}
                value={localVal}
                onChange={handleChange}
                onBlur={commit}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                type="text"
                {...props}
            />
        );
    }

    return (
        <Input
            label={label}
            error={error}
            helperText={helperText}
            value={localVal}
            onChange={handleChange}
            onBlur={commit}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            type="text"
            className={className}
            {...props}
        />
    );
};
