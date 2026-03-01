'use client';

import React from 'react';
import { Check, ChevronDown, LucideIcon } from 'lucide-react';

interface SelectOption {
    value: string;
    label: string;
    disabled?: boolean;
}

type SelectSize = 'xs' | 'sm' | 'md';
type SelectVariant = 'default' | 'filter' | 'ghost' | 'table';

interface SelectProps {
    autoFocus?: boolean;
    className?: string;
    containerClassName?: string;
    disabled?: boolean;
    label?: string;
    icon?: LucideIcon;
    id?: string;
    name?: string;
    options: SelectOption[];
    error?: string;
    helperText?: string;
    required?: boolean;
    size?: SelectSize;
    variant?: SelectVariant;
    value: string;
    placeholder?: string;
    onClose?: () => void;
    onValueChange: (value: string) => void;
    'aria-label'?: string;
}

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(({
    autoFocus,
    className = '',
    containerClassName = '',
    disabled = false,
    label,
    icon: Icon,
    id,
    name,
    options,
    error,
    helperText,
    required,
    size = 'md',
    variant = 'default',
    value,
    placeholder,
    onClose,
    onValueChange,
    ...props
}, ref) => {
    const MIN_DROPDOWN_WIDTH_PX = 240;
    const reactId = React.useId();
    const selectId = id || `select-${reactId}`;
    const listboxId = `select-listbox-${reactId}`;
    const optionIdPrefix = `select-opt-${reactId}`;
    const containerRef = React.useRef<HTMLDivElement | null>(null);
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);
    const [isOpen, setIsOpen] = React.useState(false);
    const selectedIndex = Math.max(0, options.findIndex((opt) => opt.value === value));
    const [activeIndex, setActiveIndex] = React.useState<number>(selectedIndex);
    const [menuWidthPx, setMenuWidthPx] = React.useState<number>(MIN_DROPDOWN_WIDTH_PX);

    const selectedOption = options.find((opt) => opt.value === value);
    const displayLabel = selectedOption?.label || placeholder || 'Select...';

    const sizeClasses: Record<SelectSize, string> = {
        xs: 'h-8 text-xs px-2.5',
        sm: 'h-9 text-sm px-3',
        md: 'h-11 text-sm px-4',
    };

    const variantButtonClasses: Record<SelectVariant, string> = {
        default: 'bg-slate-50 border-slate-200 text-slate-900 hover:bg-white',
        filter: 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 shadow-sm',
        ghost: 'bg-transparent border-transparent text-slate-700 hover:border-slate-300 hover:bg-white',
        table: 'bg-transparent border-slate-200/0 text-slate-700 hover:border-slate-300 hover:bg-white',
    };

    const handleClose = React.useCallback(() => {
        setIsOpen(false);
        onClose?.();
    }, [onClose]);

    const handleOpen = React.useCallback(() => {
        if (disabled) return;
        setIsOpen(true);
        setActiveIndex(selectedIndex);
    }, [disabled, selectedIndex]);

    const handleToggle = React.useCallback(() => {
        if (disabled) return;
        setIsOpen((prev) => {
            const next = !prev;
            if (!next) onClose?.();
            return next;
        });
        setActiveIndex(selectedIndex);
    }, [disabled, onClose, selectedIndex]);

    const handleSelectIndex = React.useCallback((index: number) => {
        const option = options[index];
        if (!option || option.disabled) return;
        onValueChange(option.value);
        handleClose();
    }, [handleClose, onValueChange, options]);

    const getNextEnabledIndex = React.useCallback((direction: 1 | -1, fromIndex: number) => {
        if (options.length === 0) return 0;
        let idx = fromIndex;
        for (let step = 0; step < options.length; step += 1) {
            idx = (idx + direction + options.length) % options.length;
            if (!options[idx]?.disabled) return idx;
        }
        return fromIndex;
    }, [options]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;

        if (!isOpen) {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleOpen();
            }
            return;
        }

        switch (e.key) {
            case 'ArrowDown': {
                e.preventDefault();
                setActiveIndex((prev) => getNextEnabledIndex(1, prev));
                break;
            }
            case 'ArrowUp': {
                e.preventDefault();
                setActiveIndex((prev) => getNextEnabledIndex(-1, prev));
                break;
            }
            case 'Home': {
                e.preventDefault();
                setActiveIndex(getNextEnabledIndex(1, -1));
                break;
            }
            case 'End': {
                e.preventDefault();
                setActiveIndex(getNextEnabledIndex(-1, 0));
                break;
            }
            case 'Enter':
            case ' ': {
                e.preventDefault();
                handleSelectIndex(activeIndex);
                break;
            }
            case 'Escape': {
                e.preventDefault();
                handleClose();
                break;
            }
        }
    };

    React.useEffect(() => {
        if (!isOpen) return;

        const handlePointerDown = (event: MouseEvent | PointerEvent) => {
            const target = event.target;
            if (!(target instanceof Node)) return;
            if (!containerRef.current?.contains(target)) {
                handleClose();
            }
        };

        document.addEventListener('pointerdown', handlePointerDown);
        return () => document.removeEventListener('pointerdown', handlePointerDown);
    }, [handleClose, isOpen]);

    React.useEffect(() => {
        if (!isOpen) return;
        const el = document.getElementById(`${optionIdPrefix}-${activeIndex}`);
        el?.scrollIntoView({ block: 'nearest' });
    }, [activeIndex, isOpen, optionIdPrefix]);

    React.useEffect(() => {
        if (!isOpen) return;
        const triggerWidth = triggerRef.current?.getBoundingClientRect().width || 0;
        setMenuWidthPx(Math.max(MIN_DROPDOWN_WIDTH_PX, Math.ceil(triggerWidth)));
    }, [isOpen]);

    return (
        <div className={['w-full', containerClassName].filter(Boolean).join(' ')} ref={containerRef}>
            {label && (
                <label
                    htmlFor={selectId}
                    className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5"
                >
                    {label}
                    {required && <span className="text-red-500 ml-1">*</span>}
                </label>
            )}
            <div className="relative">
                {name && <input name={name} type="hidden" value={value} />}

                {Icon && (
                    <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none z-10" />
                )}

                <button
                    id={selectId}
                    ref={(node) => {
                        triggerRef.current = node;
                        if (typeof ref === 'function') ref(node);
                        else if (ref) ref.current = node;
                    }}
                    type="button"
                    autoFocus={autoFocus}
                    onClick={handleToggle}
                    onKeyDown={handleKeyDown}
                    aria-controls={listboxId}
                    aria-expanded={isOpen}
                    aria-haspopup="listbox"
                    aria-label={props['aria-label']}
                    disabled={disabled}
                    style={{
                        minWidth: variant === 'default' || variant === 'filter' ? `${MIN_DROPDOWN_WIDTH_PX}px` : undefined,
                    }}
                    className={[
                        'w-full rounded-lg border transition-all text-left',
                        'focus:outline-none focus:ring-2 focus:ring-emerald-500',
                        'disabled:cursor-not-allowed disabled:opacity-60',
                        'flex items-center gap-2',
                        sizeClasses[size],
                        variantButtonClasses[variant],
                        Icon ? 'pl-10 pr-10' : 'pr-10',
                        error ? 'border-red-300 focus:ring-red-500' : '',
                        className,
                    ].filter(Boolean).join(' ')}
                >
                    <span className={['min-w-0 flex-1 truncate', selectedOption ? '' : 'text-slate-400'].filter(Boolean).join(' ')}>
                        {displayLabel}
                    </span>
                </button>

                <ChevronDown className={['absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 shrink-0 pointer-events-none transition-transform text-slate-500', isOpen ? 'rotate-180' : ''].join(' ')} aria-hidden />

                {isOpen && (
                    <div
                        className="absolute z-50 mt-1 rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden"
                        style={{ width: `${menuWidthPx}px` }}
                    >
                        <ul
                            id={listboxId}
                            role="listbox"
                            aria-label={props['aria-label']}
                            className="max-h-72 overflow-y-auto overscroll-contain py-1"
                        >
                            {options.map((option, index) => {
                                const isSelected = option.value === value;
                                const isActive = index === activeIndex;
                                const isDisabled = !!option.disabled;

                                return (
                                    <li
                                        key={option.value}
                                        id={`${optionIdPrefix}-${index}`}
                                        role="option"
                                        aria-selected={isSelected}
                                        aria-disabled={isDisabled}
                                        onMouseEnter={() => setActiveIndex(index)}
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={() => handleSelectIndex(index)}
                                        className={[
                                            'px-3 py-2 text-sm flex items-center justify-between gap-3',
                                            isDisabled ? 'text-slate-300 cursor-not-allowed' : 'cursor-pointer',
                                            isActive && !isDisabled ? 'bg-emerald-50 text-emerald-900' : 'text-slate-700',
                                            !isActive && !isDisabled ? 'hover:bg-slate-50' : '',
                                        ].filter(Boolean).join(' ')}
                                    >
                                        <span className="whitespace-normal break-words">{option.label}</span>
                                        {isSelected && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}
            </div>
            {error && (
                <p className="mt-1 text-xs text-red-500">{error}</p>
            )}
            {helperText && !error && (
                <p className="mt-1 text-xs text-slate-400">{helperText}</p>
            )}
        </div>
    );
});

Select.displayName = 'Select';

// Alias for backwards compatibility
export const SelectField = Select;
