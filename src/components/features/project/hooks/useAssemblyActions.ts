"use client";

import { useCallback } from "react";
import { v4 as uuidv4 } from "uuid";
import type React from "react";
import type {
  AssemblyComponent,
  CalculatedMaterial,
  CalculationMethod,
  MaterialDefinition,
  TakeoffInstance,
  WallAssembly,
} from "@/types";
import type { AssemblyTemplate } from "@/constants/defaultAssemblies";
import { getActiveCategories, getHeightSegments } from "@/lib/utils/laborHeightSplit";

interface UseAssemblyActionsParams {
  assemblies: WallAssembly[];
  assembliesRef: React.MutableRefObject<WallAssembly[]>;
  takeoffs: Record<string, TakeoffInstance[]>;
  materials: MaterialDefinition[];
  editingAssemblyId: string | null;
  scopeToDelete: string | null;
  isResizing: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  sidebarWidth: number;
  lastSidebarWidth: number;
  setAssemblies: React.Dispatch<React.SetStateAction<WallAssembly[]>>;
  setTakeoffs: React.Dispatch<
    React.SetStateAction<Record<string, TakeoffInstance[]>>
  >;
  setEditingAssemblyId: React.Dispatch<React.SetStateAction<string | null>>;
  setIsTemplateMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setScopeToDelete: React.Dispatch<React.SetStateAction<string | null>>;
  setIsScopeDeleteModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRowSearchOpen: React.Dispatch<React.SetStateAction<string | null>>;
  setRowSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  setIsResizing: React.Dispatch<React.SetStateAction<boolean>>;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  setLastSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  onScopeRemoved?: (scope: string) => void;
}

export const useAssemblyActions = ({
  assemblies,
  assembliesRef,
  takeoffs,
  materials,
  editingAssemblyId,
  scopeToDelete,
  isResizing,
  containerRef,
  sidebarWidth,
  lastSidebarWidth,
  setAssemblies,
  setTakeoffs,
  setEditingAssemblyId,
  setIsTemplateMenuOpen,
  setScopeToDelete,
  setIsScopeDeleteModalOpen,
  setRowSearchOpen,
  setRowSearchQuery,
  setIsResizing,
  setSidebarWidth,
  setLastSidebarWidth,
  onScopeRemoved,
}: UseAssemblyActionsParams) => {
  const setAssembliesWithRef = useCallback(
    (
      updater:
        | WallAssembly[]
        | ((prev: WallAssembly[]) => WallAssembly[]),
    ) => {
      setAssemblies((prev) => {
        const next = typeof updater === "function" ? updater(prev) : updater;
        assembliesRef.current = next;
        return next;
      });
    },
    [assembliesRef, setAssemblies],
  );

  const handleAddFromTemplate = useCallback(
    (template: AssemblyTemplate) => {
      const newAssembly: WallAssembly = {
        id: uuidv4(),
        code: `${template.category.substring(0, 1)}A-${assemblies.length + 1}`,
        description: template.name,
        assemblyType: template.category,
        framingType: "Light Metal",
        components: template.components.map((component) => ({
          id: uuidv4(),
          ...component,
          usage: component.usage || "Fixed Qty",
        })),
        defaultLength: 100,
        defaultHeight: 10,
      };
      setAssembliesWithRef((prev) => [...prev, newAssembly]);
      setEditingAssemblyId(newAssembly.id);
      setIsTemplateMenuOpen(false);
    },
    [assemblies.length, setAssembliesWithRef, setEditingAssemblyId, setIsTemplateMenuOpen],
  );

  const handleLoadTemplate = useCallback(
    (template: AssemblyTemplate) => {
      if (!editingAssemblyId) return;
      setAssembliesWithRef((prev) =>
        prev.map((assembly) => {
          if (assembly.id !== editingAssemblyId) return assembly;
          return {
            ...assembly,
            description: assembly.description || template.name,
            assemblyType: template.category,
            components: template.components.map((component) => ({
              id: uuidv4(),
              ...component,
              usage: component.usage || "Fixed Qty",
            })),
          };
        }),
      );
    },
    [editingAssemblyId, setAssembliesWithRef],
  );

  const openScopeDeleteModal = useCallback(
    (scope: string) => {
      if (scope === "Base Bid") return;
      setScopeToDelete(scope);
      setIsScopeDeleteModalOpen(true);
    },
    [setIsScopeDeleteModalOpen, setScopeToDelete],
  );

  const confirmScopeDelete = useCallback(() => {
    if (scopeToDelete) {
      setAssembliesWithRef((prev) =>
        prev.map((assembly) =>
          (assembly as WallAssembly & { scope?: string }).scope === scopeToDelete
            ? { ...assembly, scope: "Base Bid" }
            : assembly,
        ),
      );
      onScopeRemoved?.(scopeToDelete);
    }
    setIsScopeDeleteModalOpen(false);
    setScopeToDelete(null);
  }, [
    onScopeRemoved,
    scopeToDelete,
    setAssembliesWithRef,
    setIsScopeDeleteModalOpen,
    setScopeToDelete,
  ]);

  const handleDeleteScope = useCallback(
    (scope: string) => {
      openScopeDeleteModal(scope);
    },
    [openScopeDeleteModal],
  );

  const startResizing = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      setIsResizing(true);
    },
    [setIsResizing],
  );

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, [setIsResizing]);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing && containerRef.current) {
        const containerRect = containerRef.current.getBoundingClientRect();
        const newWidth =
          ((mouseMoveEvent.clientX - containerRect.left) /
            containerRect.width) *
          100;
        if (newWidth >= 15 && newWidth <= 85) {
          setSidebarWidth(newWidth);
          setLastSidebarWidth(newWidth);
        }
      }
    },
    [containerRef, isResizing, setLastSidebarWidth, setSidebarWidth],
  );

  const toggleSidebar = useCallback(() => {
    if (sidebarWidth < 5) {
      setSidebarWidth(lastSidebarWidth > 15 ? lastSidebarWidth : 40);
    } else {
      setLastSidebarWidth(sidebarWidth);
      setSidebarWidth(0);
    }
  }, [lastSidebarWidth, setLastSidebarWidth, setSidebarWidth, sidebarWidth]);

  const updateInstance = useCallback(
    (assemblyId: string, instanceId: string, field: string, value: unknown) => {
      if (field === "assemblyType") {
        setAssembliesWithRef((prev) =>
          prev.map((assembly) =>
            assembly.id === assemblyId
              ? {
                  ...assembly,
                  assemblyType: value as WallAssembly["assemblyType"],
                }
              : assembly,
          ),
        );
        return;
      }

      setTakeoffs((prev) => ({
        ...prev,
        [assemblyId]: prev[assemblyId].map((instance) =>
          instance.id === instanceId
            ? { ...instance, [field]: value }
            : instance,
        ),
      }));
    },
    [setAssembliesWithRef, setTakeoffs],
  );

  const deleteInstance = useCallback(
    (assemblyId: string, instanceId: string) => {
      setTakeoffs((prev) => ({
        ...prev,
        [assemblyId]: prev[assemblyId].filter(
          (instance) => instance.id !== instanceId,
        ),
      }));
    },
    [setTakeoffs],
  );

  const addInstance = useCallback(
    (assemblyId: string | null) => {
      let targetId = assemblyId;

      if (!targetId) {
        targetId = `manual-${Date.now()}`;
        const newAssembly: WallAssembly = {
          id: targetId,
          code: `M-${assemblies.length + 1}`,
          description: "Manual Internal Wall",
          framingType: "Light Metal",
          assemblyType: "Interior Wall",
          defaultLength: 10,
          defaultHeight: 10,
          components: [
            {
              id: `c1-${targetId}`,
              materialName: '3 5/8" Metal Stud 25ga',
              usage: 'Vertical @ 16" OC',
              wasteFactor: 0.08,
              installRate: 0.15,
            },
            {
              id: `c2-${targetId}`,
              materialName: '5/8" Type X Gypsum Board',
              usage: "Coverage (1 Layer)",
              wasteFactor: 0.1,
              installRate: 0.009,
            },
          ],
        };
        setAssembliesWithRef((prev) => [...prev, newAssembly]);
        setTakeoffs((prev) => ({ ...prev, [targetId as string]: [] }));
      }

      const newId = `inst-${Date.now()}`;
      setTakeoffs((prev) => ({
        ...prev,
        [targetId!]: [
          ...(prev[targetId!] || []),
          {
            id: newId,
            level: "1",
            description: assemblyId ? "New Item" : "New Manual Item",
            quantity: 1,
            length: 10,
            height: 10,
            ceilingArea: 0,
            perimeter: 0,
          },
        ],
      }));
    },
    [assemblies.length, setAssembliesWithRef, setTakeoffs],
  );

  const moveInstance = useCallback(
    (instanceId: string, fromAssemblyId: string, toAssemblyId: string) => {
      if (fromAssemblyId === toAssemblyId) return;
      const instance = takeoffs[fromAssemblyId].find((item) => item.id === instanceId);
      if (!instance) return;
      setTakeoffs((prev) => ({
        ...prev,
        [fromAssemblyId]: prev[fromAssemblyId].filter(
          (item) => item.id !== instanceId,
        ),
        [toAssemblyId]: [...(prev[toAssemblyId] || []), instance],
      }));
    },
    [setTakeoffs, takeoffs],
  );

  const updateAssemblyInfo = useCallback(
    (id: string, field: keyof WallAssembly, value: unknown) => {
      setAssembliesWithRef((prev) =>
        prev.map((assembly) => {
          if (assembly.id !== id) return assembly;
          const updated: WallAssembly = { ...assembly, [field]: value };
          // When the assembly-level height changes, propagate it to every component's
          // overrideHeight so that (a) the formula evaluator uses the new value
          // immediately and (b) buildAssemblyOverrideMaps captures it for Save.
          if (field === 'defaultHeight' && typeof value === 'number') {
            updated.components = assembly.components.map((comp) => ({
              ...comp,
              overrideHeight: value,
            }));
          }
          return updated;
        }),
      );
    },
    [setAssembliesWithRef],
  );

  const applyTemplate = useCallback(
    (assemblyId: string, type: "Wall" | "Ceiling", subtype: string) => {
      const newComponents: AssemblyComponent[] = [];

      if (type === "Ceiling") {
        if (subtype === "Suspended") {
          newComponents.push(
            {
              id: `t-${Date.now()}-1`,
              materialName: "12ga Hanger Wire",
              usage: "Suspension - Hanger Wire (16sf)",
              wasteFactor: 0.05,
              installRate: 0.01,
            },
            {
              id: `t-${Date.now()}-2`,
              materialName: "Main Runner 12' HD",
              usage: "Suspension - Main Runner (4' OC)",
              wasteFactor: 0.05,
              installRate: 0.004,
            },
            {
              id: `t-${Date.now()}-3`,
              materialName: "Cross Tee 4'",
              usage: "Suspension - Cross Tee (4' OC)",
              wasteFactor: 0.05,
              installRate: 0.004,
            },
            {
              id: `t-${Date.now()}-4`,
              materialName: "Wall Angle 12'",
              usage: "Ceiling - Perimeter (Linear)",
              wasteFactor: 0.05,
              installRate: 0.01,
            },
            {
              id: `t-${Date.now()}-5`,
              materialName: "Acoustic Tile 2x4",
              usage: "Ceiling - Tile (2x4)",
              wasteFactor: 0.05,
              installRate: 0.004,
            },
          );
        } else if (subtype === "Hard Lid") {
          newComponents.push(
            {
              id: `t-${Date.now()}-1`,
              materialName: "12ga Hanger Wire",
              usage: "Suspension - Hanger Wire (16sf)",
              wasteFactor: 0.05,
              installRate: 0.01,
            },
            {
              id: `t-${Date.now()}-2`,
              materialName: '1-1/2" Cold Rolled Channel',
              usage: "Ceiling - CRC (Primary 4' OC)",
              wasteFactor: 0.05,
              installRate: 0.01,
            },
            {
              id: `t-${Date.now()}-3`,
              materialName: '7/8" Furring Channel',
              usage: 'Ceiling - Hat Channel (Secondary 24" OC)',
              wasteFactor: 0.05,
              installRate: 0.015,
            },
            {
              id: `t-${Date.now()}-4`,
              materialName: '5/8" Type X Gypsum Board',
              usage: "Coverage (1 Layer)",
              wasteFactor: 0.1,
              installRate: 0.02,
            },
            {
              id: `t-${Date.now()}-5`,
              materialName: "Tie Wire 18ga 25 lb Bundle",
              usage: "Fixed Qty",
              wasteFactor: 0.05,
            },
          );
        } else if (subtype === "Baffles") {
          newComponents.push(
            {
              id: `t-${Date.now()}-1`,
              materialName: "Linear Baffle (4' Unit)",
              usage: "Ceiling - Baffle (Linear Calc)",
              wasteFactor: 0.05,
            },
            {
              id: `t-${Date.now()}-2`,
              materialName: "Cable Suspension Kit",
              usage: "Fixed Qty",
              wasteFactor: 0,
            },
          );
        } else if (subtype === "Steel Joist") {
          newComponents.push(
            {
              id: `t-${Date.now()}-1`,
              materialName: '600S162-54 (6" 18ga Stud)',
              usage: "Structural - Steel Joist (Span)",
              wasteFactor: 0.05,
              installRate: 0.015,
            },
            {
              id: `t-${Date.now()}-2`,
              materialName: '600T200-54 (6" Deep Leg Track)',
              usage: "Structural - Deep Leg Track",
              wasteFactor: 0.05,
              installRate: 0.01,
            },
            {
              id: `t-${Date.now()}-3`,
              materialName: '1-1/2" Flat Strap (Bracing)',
              usage: "Structural - Lateral Bracing",
              wasteFactor: 0.05,
              installRate: 0.005,
            },
          );
        }
      } else {
        newComponents.push(
          {
            id: `t-${Date.now()}-1`,
            materialName: '3 5/8" Metal Stud 25ga',
            usage: 'Vertical @ 16" OC',
            wasteFactor: 0.08,
            installRate: 0.15,
          },
          {
            id: `t-${Date.now()}-2`,
            materialName: '3 5/8" Track 25ga',
            usage: "Tracks (Top & Bottom)",
            wasteFactor: 0.05,
            installRate: 0.01,
          },
          {
            id: `t-${Date.now()}-3`,
            materialName: '5/8" Type X Gypsum Board',
            usage: "Coverage (1 Layer)",
            wasteFactor: 0.1,
            installRate: 0.009,
          },
        );
      }

      setAssembliesWithRef((prev) =>
        prev.map((assembly) =>
          assembly.id === assemblyId
            ? { ...assembly, components: newComponents }
            : assembly,
        ),
      );
    },
    [setAssembliesWithRef],
  );

  const updateComponent = useCallback(
    (
      assemblyId: string,
      componentId: string,
      field: keyof AssemblyComponent,
      value: AssemblyComponent[keyof AssemblyComponent],
    ) => {
      setAssembliesWithRef((prev) => {
        const editedAssembly = prev.find((assembly) => assembly.id === assemblyId);
        const editedComponent = editedAssembly?.components.find(
          (component) => component.id === componentId,
        );
        const isLaborRow = editedComponent?.materialCode?.startsWith("LAB-");

        if (
          field === "overrideHeight" &&
          !isLaborRow &&
          typeof value === "number"
        ) {
          const segments = getHeightSegments(value);
          const activeCategories = getActiveCategories(value);
          // Scope updates to the same spec-line group as the edited component.
          // A groupId of undefined means the component has no group (manually
          // added), in which case we update ALL non-labor components (old behavior).
          //
          // NOTE: We intentionally do NOT update assembly.code or assembly.defaultHeight
          // here. Changing the code in real-time while the user is still editing causes
          // two assemblies to temporarily share the same code, which breaks takeoff
          // matching, cost grouping, and the duplicate entries bug in the estimate list.
          // The code (P1@15 → P1@10) updates naturally after Save + reload because
          // applyOverridesToCostingData writes the new height_ft to the DB.
          const targetGroupId = editedComponent?.groupId;

          return prev.map((assembly) => {
            if (assembly.id !== assemblyId) return assembly;
            return {
              ...assembly,
              components: assembly.components.map((component) => {
                const isLabor = component.materialCode?.startsWith("LAB-");
                // A component belongs to the target group when:
                //   • the edited component HAS a groupId and this one matches, OR
                //   • neither has a groupId (manually added, fall back to old behaviour)
                const sameGroup =
                  targetGroupId == null
                    ? component.groupId == null
                    : component.groupId === targetGroupId;

                if (!isLabor && sameGroup) {
                  return { ...component, overrideHeight: value };
                }

                // Labor in the same group: derive height from segments.
                if (isLabor && sameGroup && component.heightCategory) {
                  const matchingSegment = segments.find(
                    (segment) => segment.category === component.heightCategory,
                  );
                  return {
                    ...component,
                    overrideHeight:
                      matchingSegment?.height_ft ?? component.overrideHeight,
                    muted: !activeCategories.has(component.heightCategory),
                  };
                }

                // Different group — leave completely untouched.
                return component;
              }),
            };
          });
        }

        const projectWideMaterialCode =
          (field === "wasteFactor" || field === "overrideMatCost") &&
          editedComponent?.materialCode
            ? editedComponent.materialCode
            : null;

        return prev.map((assembly) => {
          if (projectWideMaterialCode) {
            return {
              ...assembly,
              components: assembly.components.map((component) =>
                component.materialCode === projectWideMaterialCode
                  ? { ...component, [field]: value }
                  : component,
              ),
            };
          }

          if (assembly.id !== assemblyId) return assembly;
          return {
            ...assembly,
            components: assembly.components.map((component) =>
              component.id === componentId
                ? { ...component, [field]: value }
                : component,
            ),
          };
        });
      });
    },
    [setAssembliesWithRef],
  );

  const handleMaterialSelect = useCallback(
    (
      assemblyId: string,
      componentId: string,
      material: MaterialDefinition,
    ) => {
      let usage: CalculationMethod = "Fixed Qty";
      const name = material.description.toLowerCase();
      const category = material.category;

      if (category === "Framing") {
        if (
          name.includes("track") ||
          name.includes("runner") ||
          name.includes("angle")
        ) {
          usage = "Tracks (Top & Bottom)";
        } else {
          usage = 'Vertical @ 16" OC';
        }
      } else if (category === "Drywall") {
        usage = "Coverage (1 Layer)";
      } else if (category === "Insulation") {
        usage = "Insulation (Cavity)";
      } else if (category === "Finishing") {
        usage =
          name.includes("screw") || name.includes("fastener")
            ? "Fastener (per SqFt)"
            : "Joint Treatment (per SqFt)";
      } else if (category === "Ceiling") {
        if (name.includes("wire")) usage = "Suspension - Hanger Wire (16sf)";
        else if (name.includes("main")) usage = "Suspension - Main Runner (4' OC)";
        else if (name.includes("tee") || name.includes("cross")) {
          usage = "Suspension - Cross Tee (4' OC)";
        } else if (name.includes("tile") || name.includes("panel")) {
          usage = "Ceiling - Tile (2x4)";
        } else if (name.includes("angle") || name.includes("trim")) {
          usage = "Ceiling - Perimeter (Linear)";
        } else {
          usage = "Coverage (1 Layer)";
        }
      }

      let laborItem: MaterialDefinition | undefined;
      if (material.laborCostCode) {
        laborItem = materials.find(
          (item) =>
            item.category === "Labor" &&
            item.laborCostCode === material.laborCostCode,
        );

        if (!laborItem) {
          laborItem = materials.find(
            (item) =>
              item.category === "Labor" &&
              item.code === material.laborCostCode,
          );
        }
      }

      setAssembliesWithRef((prev) =>
        prev.map((assembly) => {
          if (assembly.id !== assemblyId) return assembly;

          let updatedComponents = assembly.components.map((component) => {
            if (component.id !== componentId) return component;

            if (category === "Labor") {
              return {
                ...component,
                materialCode: material.code,
                materialName: material.description,
                usage,
                materialCost: 0,
                overrideLaborCost: material.matCost,
                overrideMatCost: undefined,
                productivityFromDb: material.productivity,
              };
            }

            return {
              ...component,
              materialCode: material.code,
              materialName: material.description,
              usage,
              materialCost: material.matCost,
              overrideLaborCost: undefined,
              overrideMatCost: undefined,
              productivityFromDb: material.productivity,
            };
          });

          if (laborItem) {
            const parentComponent = assembly.components.find(
              (component) => component.id === componentId,
            );
            const currentHeightCondition = parentComponent?.heightCondition
              ? { ...parentComponent.heightCondition }
              : undefined;

            updatedComponents = [
              ...updatedComponents,
              {
                id: `auto-labor-${Date.now()}`,
                materialName: laborItem.description,
                usage,
                wasteFactor: 0,
                installRate: laborItem.productivity
                  ? 1 / laborItem.productivity
                  : undefined,
                laborHourlyRate: laborItem.hourlyRate || 65,
                heightCondition: currentHeightCondition,
              },
            ];
          }

          return {
            ...assembly,
            components: updatedComponents,
          };
        }),
      );
      setRowSearchOpen(null);
      setRowSearchQuery("");
    },
    [materials, setAssembliesWithRef, setRowSearchOpen, setRowSearchQuery],
  );

  const addComponent = useCallback(
    (assemblyId: string) => {
      setAssembliesWithRef((prev) =>
        prev.map((assembly) =>
          assembly.id === assemblyId
            ? {
                ...assembly,
                components: [
                  ...assembly.components,
                  {
                    id: `new-${Date.now()}`,
                    materialName: "Select Material",
                    usage: "Fixed Qty",
                    wasteFactor: 0.05,
                  },
                ],
              }
            : assembly,
        ),
      );
    },
    [setAssembliesWithRef],
  );

  const removeComponent = useCallback(
    (assemblyId: string, componentId: string) => {
      setAssembliesWithRef((prev) =>
        prev.map((assembly) =>
          assembly.id === assemblyId
            ? {
                ...assembly,
                components: assembly.components.filter(
                  (component) => component.id !== componentId,
                ),
              }
            : assembly,
        ),
      );
    },
    [setAssembliesWithRef],
  );

  const handleAddAssembly = useCallback(() => {
    const newId = `manual-${Date.now()}`;
    const newAssembly: WallAssembly = {
      id: newId,
      code: `W${assemblies.length + 1}`,
      description: "New Wall Assembly",
      framingType: "Light Metal",
      assemblyType: "Interior Wall",
      defaultLength: 100,
      defaultHeight: 10,
      components: [
        {
          id: `c1-${newId}`,
          materialName: '3 5/8" Metal Stud 25ga',
          usage: 'Vertical @ 16" OC',
          wasteFactor: 0.08,
          installRate: 0.15,
        },
        {
          id: `c2-${newId}`,
          materialName: '16mm (5/8") TYPE X Gypsum Board',
          usage: "Coverage (1 Layer)",
          wasteFactor: 0.1,
          installRate: 0.009,
        },
      ],
    };
    setAssembliesWithRef((prev) => [...prev, newAssembly]);
    setTakeoffs((prev) => ({ ...prev, [newId]: [] }));
    setEditingAssemblyId(newId);
  }, [assemblies.length, setAssembliesWithRef, setEditingAssemblyId, setTakeoffs]);

  const deleteAssembly = useCallback(
    (id: string) => {
      setAssembliesWithRef((prev) => prev.filter((assembly) => assembly.id !== id));
      const nextTakeoffs = { ...takeoffs };
      delete nextTakeoffs[id];
      setTakeoffs(nextTakeoffs);
      if (editingAssemblyId === id) {
        setEditingAssemblyId(null);
      }
    },
    [editingAssemblyId, setAssembliesWithRef, setEditingAssemblyId, setTakeoffs, takeoffs],
  );

  return {
    handleAddFromTemplate,
    handleLoadTemplate,
    openScopeDeleteModal,
    confirmScopeDelete,
    handleDeleteScope,
    startResizing,
    stopResizing,
    resize,
    toggleSidebar,
    updateInstance,
    deleteInstance,
    addInstance,
    moveInstance,
    updateAssemblyInfo,
    applyTemplate,
    updateComponent,
    handleMaterialSelect,
    addComponent,
    removeComponent,
    handleAddAssembly,
    deleteAssembly,
  };
};
