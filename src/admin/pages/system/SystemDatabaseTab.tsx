import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Server,
  Database,
  Search,
  ExternalLink,
  Code,
  FileSpreadsheet,
  CheckCircle,
  AlertTriangle,
  Play,
} from "lucide-react";

interface DBTable {
  name: string;
  rowsCount: number;
  indexesCount: number;
  sizeKb: number;
  description: string;
  relationships: string[];
}

const INITIAL_TABLES: DBTable[] = [
  {
    name: "public.AdminUser",
    rowsCount: 14,
    indexesCount: 2,
    sizeKb: 64,
    description: "System administrators, roles, permissions, login lock details",
    relationships: ["public.Role (role_id)"],
  },
  {
    name: "public.Store",
    rowsCount: 8,
    indexesCount: 2,
    sizeKb: 32,
    description: "Burgonomics merchant POS store nodes, latencies, locations",
    relationships: ["public.Order (store_id)"],
  },
  {
    name: "public.Order",
    rowsCount: 42150,
    indexesCount: 5,
    sizeKb: 12400,
    description: "Customer cart checkouts, timestamps, sums, sync states",
    relationships: ["public.Customer (customer_id)", "public.Store (store_id)"],
  },
  {
    name: "public.OrderItem",
    rowsCount: 98140,
    indexesCount: 4,
    sizeKb: 24800,
    description: "Individual food products linked inside active transactions",
    relationships: ["public.Order (order_id)", "public.ProductVariant (variant_id)"],
  },
  {
    name: "public.Customer",
    rowsCount: 18450,
    indexesCount: 3,
    sizeKb: 5120,
    description: "Customer identities, mobile phone identifiers, loyalties",
    relationships: ["public.Order (customer_id)"],
  },
  {
    name: "public.Campaign",
    rowsCount: 45,
    indexesCount: 2,
    sizeKb: 96,
    description: "Promotional marketing templates, segment filters, targets",
    relationships: [],
  },
];

export const SystemDatabaseTab: React.FC = () => {
  const [tables, setTables] = useState<DBTable[]>(INITIAL_TABLES);
  const [selectedTable, setSelectedTable] = useState<DBTable | null>(null);
  const [explainQuery, setExplainQuery] = useState("");
  const [explainResult, setExplainResult] = useState("");

  const handleExplain = () => {
    if (!explainQuery.trim()) return;
    // Simulate high fidelity EXPLAIN query execution plans
    const qLower = explainQuery.toLowerCase();
    if ((qLower.includes("where") && qLower.includes("index")) || qLower.includes("id")) {
      setExplainResult(
        `Index Scan using order_pkey on public.Order  (cost=0.29..8.30 rows=1 width=128)\n  Index Cond: (id = $1)\n  Planning Time: 0.124 ms\n  Execution Time: 0.082 ms`,
      );
    } else if (qLower.includes("join")) {
      setExplainResult(
        `Hash Join  (cost=12.10..425.80 rows=410 width=512)\n  Hash Cond: (o.customer_id = c.id)\n  -> Seq Scan on public.Order o  (cost=0.00..385.00 rows=42150 width=128)\n  -> Hash  (cost=10.20..10.20 rows=150 width=64)\n        -> Seq Scan on public.Customer c  (cost=0.00..10.20 rows=18450 width=64)\n  Planning Time: 0.345 ms\n  Execution Time: 1.840 ms`,
      );
    } else {
      setExplainResult(
        `Seq Scan on public.Order  (cost=0.00..4120.00 rows=42150 width=128)\n  Filter: (status = 'pending')\n  Planning Time: 0.180 ms\n  Execution Time: 12.450 ms\n  WARNING: Sequential scans on large tables impact production query performance. Ensure index coverage.`,
      );
    }
  };

  const handleExportTable = (name: string) => {
    alert(`Exported database table schema and snapshot metadata for: ${name}`);
  };

  return (
    <div className="space-y-6">
      {/* Upper overview status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-gray-800 pb-4 shrink-0 gap-4">
        <div>
          <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
            POSTGRESQL DB CORE EXPLORER
          </h3>
          <p className="text-[10px] text-gray-400 font-mono mt-0.5">
            Read-only metadata explorer • Direct modifications prohibited to secure live assets
          </p>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          <div className="flex items-center gap-2 bg-[#0c130e] border border-gray-800 rounded-xl px-3.5 py-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-gray-300 font-bold">14 Active Connections</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PostgreSQL Table Manifest */}
        <div className="lg:col-span-2 p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 space-y-4 shadow-xl">
          <span className="block text-xs font-black text-emerald-400 font-mono uppercase tracking-widest">
            Database Tables Manifest
          </span>

          <div className="overflow-x-auto">
            <table className="w-full font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 uppercase text-[9px] tracking-wider text-left">
                  <th className="py-2 px-3">Table Identifier</th>
                  <th className="py-2 px-3 text-right">Rows Count</th>
                  <th className="py-2 px-3 text-right">Indexes</th>
                  <th className="py-2 px-3 text-right">Total Disk</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-900/40">
                {tables.map((tbl) => (
                  <tr
                    key={tbl.name}
                    onClick={() => setSelectedTable(tbl)}
                    className={`hover:bg-black/20 cursor-pointer ${
                      selectedTable?.name === tbl.name ? "bg-[#0E4825]/10" : ""
                    }`}
                  >
                    <td className="py-3 px-3 font-bold text-white flex items-center gap-2">
                      <Database size={12} className="text-gray-500" />
                      <span>{tbl.name}</span>
                    </td>
                    <td className="py-3 px-3 text-right text-gray-300">
                      {tbl.rowsCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-3 text-right text-gray-300">{tbl.indexesCount}</td>
                    <td className="py-3 px-3 text-right text-gray-400">
                      {tbl.sizeKb > 1024
                        ? `${(tbl.sizeKb / 1024).toFixed(1)} MB`
                        : `${tbl.sizeKb} KB`}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleExportTable(tbl.name);
                        }}
                        className="p-1 rounded text-gray-400 hover:text-emerald-400 hover:bg-emerald-500/10 cursor-pointer inline-flex items-center"
                      >
                        <FileSpreadsheet size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Table / DB Inspector */}
        <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl flex flex-col justify-between">
          <div className="space-y-4">
            <div className="border-b border-gray-800 pb-3 flex items-center justify-between">
              <span className="font-mono text-xs font-black text-emerald-400 uppercase tracking-widest">
                Table Metadata
              </span>
            </div>

            {selectedTable ? (
              <div className="space-y-4 font-mono text-xs">
                <div>
                  <span className="block text-[9px] text-gray-500 uppercase font-bold">
                    SQL Identifier
                  </span>
                  <span className="text-xs font-bold text-white select-all break-all">
                    {selectedTable.name}
                  </span>
                </div>

                <div>
                  <span className="block text-[9px] text-gray-500 uppercase font-bold">
                    Functional Purpose
                  </span>
                  <p className="text-gray-300 leading-relaxed italic">
                    "{selectedTable.description}"
                  </p>
                </div>

                <div>
                  <span className="block text-[9px] text-gray-500 uppercase font-bold">
                    Structural Relationships
                  </span>
                  <div className="space-y-1 mt-1.5">
                    {selectedTable.relationships.length > 0 ? (
                      selectedTable.relationships.map((rel, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded bg-black/40 border border-gray-900 flex items-center justify-between text-[10px]"
                        >
                          <span className="text-gray-400">Foreign Key Constraint</span>
                          <span className="text-emerald-400 font-bold">{rel}</span>
                        </div>
                      ))
                    ) : (
                      <span className="text-gray-600 italic">No foreign key schemas mapped</span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-20 text-center space-y-2">
                <Server size={24} className="text-gray-700 mx-auto animate-pulse" />
                <p className="text-xs text-gray-500 font-mono">
                  Select a PostgreSQL table row to inspect its relationships and metadata
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SQL EXPLAIN Planner Tool */}
      <div className="p-6 rounded-[24px] bg-[#0c130e] border border-gray-800 shadow-xl space-y-4">
        <div>
          <h3 className="text-sm font-black tracking-wider text-white font-mono uppercase">
            EXPLAIN QUERY EXECUTION PLANNER
          </h3>
          <p className="text-[10px] text-gray-500 font-mono mt-0.5">
            Optimize database queries. Run EXPLAIN plans to analyze search steps and check indices
            before deployment.
          </p>
        </div>

        <div className="space-y-3 font-mono">
          <div className="flex items-center gap-2 bg-[#060a07] border border-gray-800 rounded-xl p-2 focus-within:border-emerald-600 transition-all">
            <input
              type="text"
              placeholder="EXPLAIN ANALYZE SELECT * FROM public.Order WHERE id = $1..."
              value={explainQuery}
              onChange={(e) => setExplainQuery(e.target.value)}
              className="flex-1 bg-transparent border-0 outline-none text-xs text-emerald-400 font-mono"
            />
            <button
              onClick={handleExplain}
              disabled={!explainQuery.trim()}
              className="px-4 py-2 bg-[#0E4825] hover:bg-[#156d39] text-white rounded-lg flex items-center gap-1.5 text-xs font-black uppercase tracking-wider transition-colors disabled:opacity-40 disabled:hover:bg-[#0E4825] cursor-pointer"
            >
              <Play size={12} /> Run Explain
            </button>
          </div>

          {explainResult && (
            <div className="p-4 rounded-xl bg-black border border-gray-950 font-mono text-[10px] text-gray-300 leading-relaxed whitespace-pre overflow-x-auto select-all shadow-inner">
              {explainResult}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
