"use client";

import { useRef, useState } from "react";
import type {
  CalculatedMaterial,
  TakeoffInstance,
  WallAssembly,
} from "@/types";
import type { AggregatedTakeoff } from "@/types/takeoff";

interface UseAssemblyStateParams {
  initialAssemblies: WallAssembly[];
  rawTakeoffRows: unknown[];
}

export const useAssemblyState = ({
  initialAssemblies,
  rawTakeoffRows,
}: UseAssemblyStateParams) => {
  const [assemblies, setAssemblies] = useState<WallAssembly[]>(initialAssemblies);
  // Always-current ref for save handlers that may run before React flushes state.
  const assembliesRef = useRef<WallAssembly[]>(initialAssemblies);
  assembliesRef.current = assemblies;

  const [takeoffs, setTakeoffs] = useState<Record<string, TakeoffInstance[]>>(
    {},
  );
  const [localRawTakeoffRows, setLocalRawTakeoffRows] =
    useState<unknown[]>(rawTakeoffRows);
  const [editingAssemblyId, setEditingAssemblyId] = useState<string | null>(
    null,
  );
  const [editingHeight, setEditingHeight] = useState<number | null>(null);
  const [activeAssemblyId, setActiveAssemblyId] = useState<string | null>(null);
  const [isDatabaseOpen, setIsDatabaseOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"schedule" | "materials">(
    "schedule",
  );
  const [assemblySearch, setAssemblySearch] = useState("");
  const [manualItems, setManualItems] = useState<CalculatedMaterial[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const [importedPdfFile, setImportedPdfFile] = useState<File | null>(null);
  const [importedTakeoffData, setImportedTakeoffData] =
    useState<AggregatedTakeoff[] | null>(null);
  const skipNextTakeoffPersistRef = useRef(true);
  const takeoffPersistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const lastPersistedTakeoffPayloadRef = useRef("");

  const [isScopeDeleteModalOpen, setIsScopeDeleteModalOpen] = useState(false);
  const [scopeToDelete, setScopeToDelete] = useState<string | null>(null);
  const [rowSearchOpen, setRowSearchOpen] = useState<string | null>(null);
  const [rowSearchQuery, setRowSearchQuery] = useState("");
  const [formulaDropdownOpen, setFormulaDropdownOpen] = useState<string | null>(
    null,
  );
  const [prodCalcOpen, setProdCalcOpen] = useState<string | null>(null);
  const [isTemplateMenuOpen, setIsTemplateMenuOpen] = useState(false);
  const templateMenuRef = useRef<HTMLDivElement>(null);

  const [sidebarWidth, setSidebarWidth] = useState(40);
  const [lastSidebarWidth, setLastSidebarWidth] = useState(40);
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  return {
    assemblies,
    setAssemblies,
    assembliesRef,
    takeoffs,
    setTakeoffs,
    localRawTakeoffRows,
    setLocalRawTakeoffRows,
    editingAssemblyId,
    setEditingAssemblyId,
    editingHeight,
    setEditingHeight,
    activeAssemblyId,
    setActiveAssemblyId,
    isDatabaseOpen,
    setIsDatabaseOpen,
    activeTab,
    setActiveTab,
    assemblySearch,
    setAssemblySearch,
    manualItems,
    setManualItems,
    isSearchOpen,
    setIsSearchOpen,
    searchRef,
    importedPdfFile,
    setImportedPdfFile,
    importedTakeoffData,
    setImportedTakeoffData,
    skipNextTakeoffPersistRef,
    takeoffPersistTimeoutRef,
    lastPersistedTakeoffPayloadRef,
    isScopeDeleteModalOpen,
    setIsScopeDeleteModalOpen,
    scopeToDelete,
    setScopeToDelete,
    rowSearchOpen,
    setRowSearchOpen,
    rowSearchQuery,
    setRowSearchQuery,
    formulaDropdownOpen,
    setFormulaDropdownOpen,
    prodCalcOpen,
    setProdCalcOpen,
    isTemplateMenuOpen,
    setIsTemplateMenuOpen,
    templateMenuRef,
    sidebarWidth,
    setSidebarWidth,
    lastSidebarWidth,
    setLastSidebarWidth,
    isResizing,
    setIsResizing,
    containerRef,
  };
};
