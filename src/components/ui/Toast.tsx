'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';

// Toast types
export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
    id: string;
    type: ToastType;
    title: string;
    message?: string;
    duration?: number;
}

interface ToastContextType {
    toasts: Toast[];
    addToast: (toast: Omit<Toast, 'id'>) => void;
    removeToast: (id: string) => void;
    success: (title: string, message?: string) => void;
    error: (title: string, message?: string) => void;
    warning: (title: string, message?: string) => void;
    info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

// Toast styles configuration
const toastStyles: Record<ToastType, { bg: string; border: string; icon: React.ReactNode; iconColor: string }> = {
    success: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        icon: <CheckCircle className="w-5 h-5" />,
        iconColor: 'text-emerald-500',
    },
    error: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        icon: <AlertCircle className="w-5 h-5" />,
        iconColor: 'text-red-500',
    },
    warning: {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        icon: <AlertTriangle className="w-5 h-5" />,
        iconColor: 'text-amber-500',
    },
    info: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        icon: <Info className="w-5 h-5" />,
        iconColor: 'text-blue-500',
    },
};

// Individual Toast Component
const ToastItem: React.FC<{ toast: Toast; onRemove: (id: string) => void }> = ({ toast, onRemove }) => {
    const style = toastStyles[toast.type];

    useEffect(() => {
        const duration = toast.duration ?? 5000;
        if (duration > 0) {
            const timer = setTimeout(() => {
                onRemove(toast.id);
            }, duration);
            return () => clearTimeout(timer);
        }
    }, [toast.id, toast.duration, onRemove]);

    return (
        <div
            className={`${style.bg} ${style.border} border rounded-lg shadow-lg p-4 min-w-[320px] max-w-md animate-in slide-in-from-right fade-in duration-300`}
            role="alert"
        >
            <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 ${style.iconColor}`}>
                    {style.icon}
                </div>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{toast.title}</p>
                    {toast.message && (
                        <p className="text-slate-600 text-sm mt-1">{toast.message}</p>
                    )}
                </div>
                <button
                    onClick={() => onRemove(toast.id)}
                    className="flex-shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

// Toast Container Component
const ToastContainer: React.FC<{ toasts: Toast[]; onRemove: (id: string) => void }> = ({ toasts, onRemove }) => {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || toasts.length === 0) return null;

    return createPortal(
        <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-3">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
            ))}
        </div>,
        document.body
    );
};

// Toast Provider Component
export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
        const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setToasts((prev) => [...prev, { ...toast, id }]);
    }, []);

    const success = useCallback((title: string, message?: string) => {
        addToast({ type: 'success', title, message });
    }, [addToast]);

    const error = useCallback((title: string, message?: string) => {
        addToast({ type: 'error', title, message });
    }, [addToast]);

    const warning = useCallback((title: string, message?: string) => {
        addToast({ type: 'warning', title, message });
    }, [addToast]);

    const info = useCallback((title: string, message?: string) => {
        addToast({ type: 'info', title, message });
    }, [addToast]);

    return (
        <ToastContext.Provider value={{ toasts, addToast, removeToast, success, error, warning, info }}>
            {children}
            <ToastContainer toasts={toasts} onRemove={removeToast} />
        </ToastContext.Provider>
    );
};

// Hook to use toast
export const useToast = (): ToastContextType => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
