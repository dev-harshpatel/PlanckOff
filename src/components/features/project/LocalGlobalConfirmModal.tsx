'use client';

import { FolderOpen, Globe } from 'lucide-react';
import { Modal, ModalBody, ModalFooter, Button } from '@/components/ui';

interface LocalGlobalConfirmModalProps {
  isOpen: boolean;
  materialName: string;
  fieldLabel: string;
  isSaving: boolean;
  onLocal: () => void;
  onGlobal: () => void;
  onCancel: () => void;
}

export function LocalGlobalConfirmModal({
  isOpen,
  materialName,
  fieldLabel,
  isSaving,
  onLocal,
  onGlobal,
  onCancel,
}: LocalGlobalConfirmModalProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title={`Update "${fieldLabel}"`} size="sm">
      <ModalBody>
        <p className="text-sm text-slate-600 mb-4">
          You changed{' '}
          <span className="font-medium text-slate-800">{materialName}</span>.
          Where should this update apply?
        </p>

        <div className="flex flex-col gap-2">
          {/* Local option — highlighted as primary choice */}
          <button
            type="button"
            onClick={onLocal}
            disabled={isSaving}
            className="flex items-start gap-3 p-3 rounded-lg border-2 border-emerald-500 bg-emerald-50 text-left hover:bg-emerald-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FolderOpen size={18} className="text-emerald-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-emerald-800">This project only</p>
              <p className="text-xs text-emerald-600 mt-0.5">
                Saves an override — won't affect other projects
              </p>
            </div>
          </button>

          {/* Global option */}
          <button
            type="button"
            onClick={onGlobal}
            disabled={isSaving}
            className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 bg-white text-left hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Globe size={18} className="text-slate-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-slate-700">Update database (all projects)</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Updates the global spec database — all projects will see this change
              </p>
            </div>
          </button>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" size="sm" onClick={onCancel} disabled={isSaving}>
          Cancel
        </Button>
      </ModalFooter>
    </Modal>
  );
}
