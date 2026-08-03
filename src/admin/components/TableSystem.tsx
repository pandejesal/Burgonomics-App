import React, { useState, useMemo } from "react";
import {
  ChevronDown,
  ChevronUp,
  Search,
  Eye,
  Download,
  Check,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { SkeletonTable } from "./FeedbackStates";

export interface TableColumn<T> {
  header: string;
  accessorKey: string;
  cell?: (row: T) => React.ReactNode;
  sortable?: boolean;
}

interface TableBulkAction<T> {
  label: string;
  onClick: (selectedRows: T[]) => void;
  variant?: "primary" | "secondary" | "danger";
}

interface ResponsiveTableProps<T> {
  data: T[];
  columns: TableColumn<T>[];
  searchPlaceholder?: string;
  searchFields?: string[];
  bulkActions?: TableBulkAction<T>[];
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
  exportFileName?: string;
}

export function ResponsiveTable<T extends { id: string | number; [key: string]: any }>({
  data = [],
  columns = [],
  searchPlaceholder = "Search records...",
  searchFields = [],
  bulkActions = [],
  onRowClick,
  isLoading = false,
  exportFileName = "export-data",
}: ResponsiveTableProps<T>) {
  // States
  const [searchTerm, setSearchTerm] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(columns.map((c) => c.accessorKey)),
  );
  const [showColumnDropdown, setShowColumnDropdown] = useState(false);

  // Reset pagination on search
  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    setCurrentPage(1);
  };

  // Sort mechanism
  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortOrder === "asc") {
        setSortOrder("desc");
      } else {
        setSortKey(null);
      }
    } else {
      setSortKey(key);
      setSortOrder("asc");
    }
  };

  // Nested property resolver (e.g. 'role.name')
  const getNestedValue = (obj: any, path: string): any => {
    return path.split(".").reduce((acc, part) => acc && acc[part], obj);
  };

  // Filter & Search data
  const processedData = useMemo(() => {
    let result = [...data];

    // Search filter
    if (searchTerm.trim() !== "") {
      const lowerSearch = searchTerm.toLowerCase();
      const fieldsToSearch =
        searchFields.length > 0 ? searchFields : columns.map((c) => c.accessorKey);

      result = result.filter((row) => {
        return fieldsToSearch.some((field) => {
          const val = getNestedValue(row, field);
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(lowerSearch);
        });
      });
    }

    // Sorting
    if (sortKey) {
      result.sort((a, b) => {
        const valA = getNestedValue(a, sortKey);
        const valB = getNestedValue(b, sortKey);

        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;

        if (typeof valA === "number" && typeof valB === "number") {
          return sortOrder === "asc" ? valA - valB : valB - valA;
        }

        const strA = String(valA).toLowerCase();
        const strB = String(valB).toLowerCase();

        if (strA < strB) return sortOrder === "asc" ? -1 : 1;
        if (strA > strB) return sortOrder === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, searchTerm, searchFields, columns, sortKey, sortOrder]);

  // Pagination bounds
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedData.slice(start, start + pageSize);
  }, [processedData, currentPage, pageSize]);

  const totalPages = Math.ceil(processedData.length / pageSize) || 1;

  // Selection actions
  const isAllSelected =
    paginatedData.length > 0 && paginatedData.every((row) => selectedIds.has(row.id));
  const isAnySelected = selectedIds.size > 0;

  const handleSelectAll = () => {
    const nextSelected = new Set(selectedIds);
    if (isAllSelected) {
      paginatedData.forEach((row) => nextSelected.delete(row.id));
    } else {
      paginatedData.forEach((row) => nextSelected.add(row.id));
    }
    setSelectedIds(nextSelected);
  };

  const handleSelectRow = (id: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextSelected = new Set(selectedIds);
    if (nextSelected.has(id)) {
      nextSelected.delete(id);
    } else {
      nextSelected.add(id);
    }
    setSelectedIds(nextSelected);
  };

  const toggleColumn = (key: string) => {
    const nextVisible = new Set(visibleColumns);
    if (nextVisible.has(key)) {
      if (nextVisible.size > 1) {
        // Guard to keep at least one column
        nextVisible.delete(key);
      }
    } else {
      nextVisible.add(key);
    }
    setVisibleColumns(nextVisible);
  };

  // CSV Exporter
  const handleExportCSV = () => {
    const visibleColsList = columns.filter((col) => visibleColumns.has(col.accessorKey));

    // Headers Row
    const headers = visibleColsList.map((col) => `"${col.header.replace(/"/g, '""')}"`).join(",");

    // Data Rows
    const rows = processedData.map((row) => {
      return visibleColsList
        .map((col) => {
          const val = getNestedValue(row, col.accessorKey);
          const valStr = val !== null && val !== undefined ? String(val) : "";
          return `"${valStr.replace(/"/g, '""')}"`;
        })
        .join(",");
    });

    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `${exportFileName}_${new Date().toISOString().split("T")[0]}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (isLoading) {
    return <SkeletonTable rows={pageSize} cols={columns.length} />;
  }

  const activeColumns = columns.filter((col) => visibleColumns.has(col.accessorKey));

  return (
    <div className="space-y-4 font-sans">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400">
            <Search size={16} />
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full pl-10 pr-10 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0E4825]/25 focus:border-[#0E4825] transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Toolbar controls */}
        <div className="flex items-center gap-3">
          {/* Column Visibility dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowColumnDropdown(!showColumnDropdown)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
            >
              <SlidersHorizontal size={14} />
              <span>Columns</span>
              <ChevronDown
                size={14}
                className={`transition-transform ${showColumnDropdown ? "rotate-180" : ""}`}
              />
            </button>

            {showColumnDropdown && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowColumnDropdown(false)} />
                <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] p-2 shadow-xl z-20">
                  <div className="px-3 py-1.5 border-b border-gray-50 dark:border-gray-800/50 mb-1">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                      Show Columns
                    </span>
                  </div>
                  <div className="space-y-0.5 max-h-60 overflow-y-auto">
                    {columns.map((col) => (
                      <button
                        key={col.accessorKey}
                        onClick={() => toggleColumn(col.accessorKey)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900"
                      >
                        <span>{col.header}</span>
                        {visibleColumns.has(col.accessorKey) && (
                          <Check size={14} className="text-[#0E4825] dark:text-emerald-400" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Export button */}
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
          >
            <Download size={14} />
            <span>CSV Export</span>
          </button>
        </div>
      </div>

      {/* Selected Action Floating Bar */}
      {isAnySelected && bulkActions.length > 0 && (
        <div className="bg-[#0E4825] text-white p-4 rounded-2xl flex items-center justify-between gap-4 shadow-lg animate-fade-in">
          <div className="flex items-center gap-3">
            <span className="h-5 w-5 rounded-md bg-white/20 flex items-center justify-center text-xs font-bold font-mono">
              {selectedIds.size}
            </span>
            <span className="text-xs font-bold">Records selected</span>
          </div>
          <div className="flex items-center gap-2">
            {bulkActions.map((act, index) => (
              <button
                key={index}
                onClick={() => {
                  const items = data.filter((row) => selectedIds.has(row.id));
                  act.onClick(items);
                  setSelectedIds(new Set());
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold border border-white/10 ${
                  act.variant === "danger"
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : act.variant === "secondary"
                      ? "bg-amber-500 hover:bg-amber-600 text-white"
                      : "bg-white text-[#0E4825] hover:bg-white/90"
                }`}
              >
                {act.label}
              </button>
            ))}
            <button
              onClick={() => setSelectedIds(new Set())}
              className="p-2 hover:bg-white/10 rounded-xl text-white/70 hover:text-white"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Main Table Structure */}
      <div className="w-full border border-gray-100 dark:border-gray-800 rounded-[20px] overflow-hidden bg-white dark:bg-[#1A1A1A] shadow-[0_4px_20px_rgba(0,0,0,0.01)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead className="bg-gray-50/70 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-800 sticky top-0 backdrop-blur-[2px] z-10">
              <tr>
                {bulkActions.length > 0 && (
                  <th className="p-4 pl-6 w-10">
                    <input
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-[#0E4825] focus:ring-[#0E4825]"
                    />
                  </th>
                )}

                {activeColumns.map((col) => (
                  <th
                    key={col.accessorKey}
                    onClick={() => col.sortable !== false && handleSort(col.accessorKey)}
                    className={`p-4 text-xs font-bold text-gray-400 uppercase tracking-wider select-none ${
                      col.sortable !== false
                        ? "cursor-pointer hover:bg-gray-100/50 dark:hover:bg-gray-900/50"
                        : ""
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span>{col.header}</span>
                      {col.sortable !== false && (
                        <span className="text-gray-400">
                          {sortKey === col.accessorKey ? (
                            sortOrder === "asc" ? (
                              <ChevronUp size={13} />
                            ) : (
                              <ChevronDown size={13} />
                            )
                          ) : (
                            <ChevronDown size={13} className="opacity-20" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/80">
              {paginatedData.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeColumns.length + (bulkActions.length > 0 ? 1 : 0)}
                    className="p-12 text-center text-xs font-semibold text-gray-400 uppercase tracking-wider"
                  >
                    No matching records found.
                  </td>
                </tr>
              ) : (
                paginatedData.map((row) => {
                  const isSelected = selectedIds.has(row.id);
                  return (
                    <tr
                      key={row.id}
                      onClick={() => onRowClick && onRowClick(row)}
                      className={`hover:bg-gray-50/50 dark:hover:bg-gray-900/20 transition-colors ${
                        onRowClick ? "cursor-pointer" : ""
                      } ${isSelected ? "bg-[#0E4825]/5 dark:bg-[#0E4825]/10" : ""}`}
                    >
                      {bulkActions.length > 0 && (
                        <td className="p-4 pl-6 w-10" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => handleSelectRow(row.id, e as any)}
                            className="h-4 w-4 rounded border-gray-300 text-[#0E4825] focus:ring-[#0E4825]"
                          />
                        </td>
                      )}

                      {activeColumns.map((col) => (
                        <td
                          key={col.accessorKey}
                          className="p-4 text-sm font-semibold text-gray-700 dark:text-gray-300"
                        >
                          {col.cell ? col.cell(row) : getNestedValue(row, col.accessorKey)}
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-2">
        <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
          <span>Show</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setCurrentPage(1);
            }}
            className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] py-1 px-2 text-gray-700 dark:text-gray-300 focus:outline-none"
          >
            {[10, 25, 50, 100].map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <span>records of {processedData.length} total</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft size={16} />
          </button>

          <span className="text-xs font-bold text-gray-700 dark:text-gray-300 px-3">
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A1A1A] text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
