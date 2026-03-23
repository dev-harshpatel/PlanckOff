'use client';

import React from 'react';

export interface ComponentFieldProps {
    label: string;
    value: string | number | undefined | null;
    onChange: (val: string | number | undefined) => void;
    type?: 'text' | 'number' | 'textarea';
    disabled?: boolean;
    placeholder?: string;
    isFormula?: boolean;
    rows?: number;
}

const labelClasses =
    'flex items-end gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider min-h-[28px] pb-1.5';

const baseInputStyles = (disabled: boolean) =>
    [
        'w-full rounded-lg px-3 py-2.5 text-sm transition-all',
        'border focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-400',
        disabled
            ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
            : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300',
    ].join(' ');

const formulaStyles = [
    'w-full rounded-lg px-3 py-2.5 text-xs transition-all font-mono leading-relaxed',
    'bg-slate-900 text-emerald-300 border border-slate-700 placeholder-slate-500',
    'focus:outline-none focus:ring-2 focus:ring-emerald-400/50 focus:border-emerald-500 resize-none',
].join(' ');

export const ComponentField = ({
    label,
    value,
    onChange,
    type = 'text',
    disabled = false,
    placeholder = '',
    isFormula = false,
    rows,
}: ComponentFieldProps) => {
    const displayValue = value !== undefined && value !== null ? String(value) : '';

    if (type === 'textarea') {
        return (
            <div>
                <label className={labelClasses}>{label}</label>
                <textarea
                    className={isFormula ? formulaStyles : `${baseInputStyles(disabled)} resize-none`}
                    value={displayValue}
                    placeholder={placeholder}
                    rows={rows ?? 2}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value || undefined)}
                    spellCheck={false}
                />
            </div>
        );
    }

    return (
        <div>
            <label className={labelClasses}>{label}</label>
            <input
                type={type}
                className={baseInputStyles(disabled)}
                value={displayValue}
                placeholder={placeholder}
                disabled={disabled}
                onChange={(e) => {
                    const val = e.target.value;
                    if (type === 'number') {
                        onChange(val === '' ? undefined : parseFloat(val));
                    } else {
                        onChange(val || undefined);
                    }
                }}
            />
        </div>
    );
};
