'use client';

import React from 'react';
import { AlertTriangle, Trash2, Info, HelpCircle } from 'lucide-react';
import { Modal, ModalBody, ModalFooter } from './Modal';
import { Button } from './Button';

export type ConfirmModalVariant = 'danger' | 'warning' | 'info' | 'default';

interface ConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: ConfirmModalVariant;
    isLoading?: boolean;
}

const variantConfig: Record<ConfirmModalVariant, {
    icon: React.ReactNode;
    iconBg: string;
    confirmVariant: 'danger' | 'primary' | 'secondary' | 'success';
}> = {
    danger: {
        icon: <Trash2 className="w-6 h-6 text-red-600" />,
        iconBg: 'bg-red-100',
        confirmVariant: 'danger',
    },
    warning: {
        icon: <AlertTriangle className="w-6 h-6 text-amber-600" />,
        iconBg: 'bg-amber-100',
        confirmVariant: 'primary',
    },
    info: {
        icon: <Info className="w-6 h-6 text-blue-600" />,
        iconBg: 'bg-blue-100',
        confirmVariant: 'primary',
    },
    default: {
        icon: <HelpCircle className="w-6 h-6 text-slate-600" />,
        iconBg: 'bg-slate-100',
        confirmVariant: 'primary',
    },
};

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmText = 'Confirm',
    cancelText = 'Cancel',
    variant = 'default',
    isLoading = false,
}) => {
    const config = variantConfig[variant];

    const handleConfirm = () => {
        onConfirm();
        if (!isLoading) {
            onClose();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            size="sm"
            showCloseButton={false}
            closeOnOverlayClick={!isLoading}
        >
            <ModalBody className="text-center pt-6">
                <div className={`w-14 h-14 mx-auto mb-4 rounded-full ${config.iconBg} flex items-center justify-center`}>
                    {config.icon}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{title}</h3>
                <p className="text-slate-600 text-sm">{message}</p>
            </ModalBody>
            <ModalFooter className="justify-center gap-3 pb-6">
                <Button
                    variant="secondary"
                    onClick={onClose}
                    disabled={isLoading}
                >
                    {cancelText}
                </Button>
                <Button
                    variant={config.confirmVariant}
                    onClick={handleConfirm}
                    disabled={isLoading}
                >
                    {isLoading ? 'Please wait...' : confirmText}
                </Button>
            </ModalFooter>
        </Modal>
    );
};
