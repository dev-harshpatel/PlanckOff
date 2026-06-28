'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';

interface ModalProps {
  children: React.ReactNode;
  closeOnOverlayClick?: boolean;
  isOpen: boolean;
  minimized?: boolean;
  onClose: () => void;
  showCloseButton?: boolean;
  size?: ModalSize;
  title?: string;
}

const sizeStyles: Record<ModalSize, string> = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-[98vw] w-full',
};

export const Modal: React.FC<ModalProps> = ({
  children,
  closeOnOverlayClick = true,
  isOpen,
  minimized = false,
  onClose,
  showCloseButton = true,
  size = "md",
  title,
}) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  if (minimized) {
    return createPortal(<>{children}</>, document.body);
  }

  const modalContent = (
    <div
      className="fixed inset-0 w-full h-full bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div
        className={`bg-white rounded-xl shadow-2xl w-full flex flex-col ${sizeStyles[size]} ${size === "full" ? "h-[95vh]" : "max-h-[90vh]"} overflow-hidden animate-in fade-in zoom-in duration-200`}
      >
        {title && (
          <div className="flex justify-between items-center p-5 border-b border-slate-100 bg-slate-50/50">
            <h2 className="text-lg font-bold text-slate-800">{title}</h2>
            {showCloseButton && (
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
        )}
        {children}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

// Sub-components for better structure
interface ModalBodyProps {
    children: React.ReactNode;
    className?: string;
}

export const ModalBody: React.FC<ModalBodyProps> = ({ children, className = '' }) => (
    <div className={`p-6 flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-slate-200 [&::-webkit-scrollbar-thumb]:rounded-full hover:[&::-webkit-scrollbar-thumb]:bg-slate-300 ${className}`}>
        {children}
    </div>
);

interface ModalFooterProps {
    children: React.ReactNode;
    className?: string;
}

export const ModalFooter: React.FC<ModalFooterProps> = ({ children, className = '' }) => (
    <div className={`p-4 border-t border-slate-100 flex gap-3 justify-end ${className}`}>
        {children}
    </div>
);
