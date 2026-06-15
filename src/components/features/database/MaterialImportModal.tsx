"use client";

import React from "react";
import { Button, Modal, ModalBody, ModalFooter } from "@/components/ui";
import { MaterialDefinition } from "@/types";

interface MaterialImportModalProps {
  isOpen: boolean;
  importPendingData: {
    validMaterials: MaterialDefinition[];
    invalidRows: { row: number; errors: string[] }[];
  } | null;
  isCommittingImport: boolean;
  onCommit: (mode: "merge" | "replace") => void;
  onClose: () => void;
}

export const MaterialImportModal = ({
  isOpen,
  importPendingData,
  isCommittingImport,
  onCommit,
  onClose,
}: MaterialImportModalProps) => (
  <Modal isOpen={isOpen} onClose={onClose} title="Import Materials" size="md">
    <ModalBody>
      <p className="text-sm text-slate-600 mb-1">
        <span className="font-semibold text-slate-800">
          {importPendingData?.validMaterials.length ?? 0} materials
        </span>{" "}
        ready to import.
        {(importPendingData?.invalidRows.length ?? 0) > 0 && (
          <span className="text-amber-600 ml-1">
            ({importPendingData?.invalidRows.length} rows skipped due to errors)
          </span>
        )}
      </p>
      <p className="text-sm text-slate-500 mb-6">
        How would you like to import?
      </p>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onCommit("merge")}
          disabled={isCommittingImport}
          className="flex flex-col items-start gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-all text-left"
        >
          <span className="text-sm font-semibold text-slate-800">Merge</span>
          <span className="text-xs text-slate-500">
            Add new items and update existing ones. Keeps materials not in the
            file.
          </span>
        </button>
        <button
          onClick={() => onCommit("replace")}
          disabled={isCommittingImport}
          className="flex flex-col items-start gap-2 p-4 border-2 border-slate-200 rounded-xl hover:border-red-400 hover:bg-red-50 transition-all text-left"
        >
          <span className="text-sm font-semibold text-slate-800">
            Replace All
          </span>
          <span className="text-xs text-slate-500">
            Delete all existing materials and replace with the imported data.
          </span>
        </button>
      </div>
    </ModalBody>
    <ModalFooter>
      <Button variant="secondary" onClick={onClose} disabled={isCommittingImport}>
        Cancel
      </Button>
    </ModalFooter>
  </Modal>
);
