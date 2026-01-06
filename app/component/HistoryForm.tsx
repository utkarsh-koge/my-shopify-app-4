import React from "react";
import { History, Eye, RotateCcw, User, Clock, FileText, ChevronDown, ChevronUp, AlertCircle, ChevronLeft, ChevronRight, Database } from "lucide-react";

export interface Log {
  id: string;
  userName: string;
  operation: string;
  objectType: string;
  value: any[];
  restore: boolean;
  time: string;
}

interface LogsTableProps {
  logs: Log[];
  openRow: number | null;
  setOpenRow: (row: number | null) => void;
  handleRestore: (log: Log) => void;
  isLoading: boolean;
  onNext: () => void;
  onPrev: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  isDbCreated: boolean;
  onCreateDb: () => void;
}

export function LogsTable({ logs, openRow, setOpenRow, handleRestore, isLoading, onNext, onPrev, hasNext, hasPrev, isDbCreated, onCreateDb }: LogsTableProps) {
  // Polaris-like card styles
  const wrapperClass = "bg-white rounded-xl shadow-sm border border-[#dfe3e8] overflow-hidden flex flex-col";
  const fixedHeight = "h-[600px]";

  if (isLoading) {
    return (
      <div className={`${wrapperClass} ${fixedHeight} items-center justify-center`}>
        <div className="flex flex-col items-center">
          <div className="w-8 h-8 border-2 border-gray-200 border-t-black rounded-full animate-spin mb-4"></div>
          <h3 className="text-sm font-medium text-gray-900">Loading History...</h3>
        </div>
      </div>
    );
  }

  if (!isDbCreated) {
    return (
      <div className={`${wrapperClass} ${fixedHeight} items-center justify-center text-center p-8`}>
        <div className="bg-blue-50 p-4 rounded-full mb-4">
          <Database className="w-12 h-12 text-blue-600" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">Database Required</h3>
        <p className="text-sm text-gray-500 mt-2 max-w-sm">
          A database is required to track your history and enable restore functionality. Please create one to continue.
        </p>
        <button
          onClick={onCreateDb}
          className="mt-4 inline-flex justify-center items-center px-4 py-2 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-[#1a1a1a] hover:bg-[#303030] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-all cursor-pointer"
        >
          Create Database
        </button>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className={`${wrapperClass} ${fixedHeight} items-center justify-center text-center p-8`}>
        <div className="bg-gray-50 p-4 rounded-full mb-4">
          <History className="w-12 h-12 text-gray-400" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">No activity yet</h3>
        <p className="text-sm text-gray-500 mt-2 max-w-sm">
          Your bulk operation history and restore points will appear here once you perform some actions.
        </p>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      {/* Table Header */}
      <div className="px-6 py-4 border-b border-[#f1f2f3] bg-[#fafbfb] flex items-center gap-2 shrink-0">
        <History size={18} className="text-gray-500" />
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">History table</h2>
      </div>
      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm text-left">
          <thead className="bg-[#f7f7f7] border-b border-[#dfe3e8] sticky top-0 z-10">
            <tr>
              <th className="px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">User</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Operation</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Details</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider">Action</th>
              <th className="px-4 py-3 text-xs font-medium text-gray-600 uppercase tracking-wider text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ebeef0] bg-white">
            {logs.map((log, index) => (
              <React.Fragment key={log.id}>
                <LogRow
                  index={index}
                  log={log}
                  openRow={openRow}
                  setOpenRow={setOpenRow}
                  handleRestore={handleRestore}
                />
                {openRow === index && <LogDetailsRow log={log} />}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 border-t border-[#dfe3e8] bg-[#fcfdfd] flex items-center justify-center gap-2">
        <button
          onClick={onPrev}
          disabled={!hasPrev}
          className="inline-flex cursor-pointer items-center gap-1 px-3 py-1.5 border border-[#c9cccf] rounded-lg text-sm font-medium text-[#202223] bg-white hover:bg-[#f6f6f7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          <ChevronLeft size={16} />
          Previous
        </button>
        <button
          onClick={onNext}
          disabled={!hasNext}
          className="inline-flex cursor-pointer items-center gap-1 px-3 py-1.5 border border-[#c9cccf] rounded-lg text-sm font-medium text-[#202223] bg-white hover:bg-[#f6f6f7] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

interface LogRowProps {
  log: Log;
  index: number;
  openRow: number | null;
  setOpenRow: (row: number | null) => void;
  handleRestore: (log: Log) => void;
}

export function LogRow({ log, index, openRow, setOpenRow, handleRestore }: LogRowProps) {
  const isOpen = openRow === index;

  return (
    <tr className={`hover:bg-[#f6f6f7] transition-colors ${isOpen ? 'bg-[#f6f6f7]' : ''}`}>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-2 text-[#202223] font-medium">
          <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-500">
            <User size={14} />
          </div>
          <span className="text-sm">{log.userName || "Unknown User"}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-col">
          <span className="text-[#202223] font-semibold text-sm">{log.operation}</span>
          {log.objectType && (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800 mt-1 w-max">
              {log.objectType}
            </span>
          )}
        </div>
      </td>

      <td className="px-4 py-3">
        <button
          onClick={() => setOpenRow(isOpen ? null : index)}
          className="inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 border border-[#c9cccf] text-[#202223] rounded-lg shadow-sm hover:bg-[#f6f6f7] transition-colors text-xs font-medium bg-white"
        >
          {isOpen ? <ChevronUp size={14} /> : <Eye size={14} />}
          {isOpen ? 'Hide Details' : 'View Details'}
        </button>
      </td>

      <td className="px-4 py-3">
        <button
          onClick={() => handleRestore(log)}
          disabled={!log.restore}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${log.restore
            ? "bg-black text-white hover:bg-gray-800 shadow-md cursor-pointer"
            : "bg-gray-100 text-gray-400 cursor-not-allowed border border-[#dfe3e8]"
            }`}
        >
          <RotateCcw size={14} />
          Undo
        </button>
      </td>

      <td className="px-4 py-3 text-right">
        <div className="flex flex-col items-end text-xs">
          <span className="text-[#202223] font-medium">{new Date(log.time).toLocaleDateString()}</span>
          <span className="text-gray-500">{new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </td>
    </tr>
  );
}

interface LogDetailsRowProps {
  log: Log;
}

export function LogDetailsRow({ log }: LogDetailsRowProps) {
  const shouldScroll = log?.value?.length > 5;

  return (
    <tr className="bg-[#fcfdfd]">
      <td colSpan={5} className="px-4 py-4 border-b border-[#dfe3e8] shadow-inner">
        <div className="bg-white border border-[#dfe3e8] rounded-lg overflow-hidden max-w-5xl mx-auto">
          <div className="px-4 py-2 bg-[#f7f7f7] border-b border-[#dfe3e8] flex items-center gap-2">
            <FileText size={14} className="text-gray-500" />
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
              Operation Payload
            </span>
          </div>

          {/* TABLE WRAPPER */}
          <div
            className={`w-full overflow-x-auto ${shouldScroll
              ? "max-h-[300px] overflow-y-auto custom-scrollbar"
              : ""
              }`}
          >
            <table className="w-full text-xs text-left">
              <thead className="bg-white sticky top-0 shadow-sm z-10">
                <tr>
                  <th className="px-4 py-2 font-semibold text-gray-600 border-b border-[#ebeef0]">
                    Resource ID
                  </th>

                  {log.operation === "Tags-removed" ||
                    log.operation === "Tags-Added" ? (
                    <th className="px-4 py-2 font-semibold text-gray-600 border-b border-[#ebeef0]">
                      {log.operation === "Tags-Added"
                        ? "Tags Added"
                        : "Tags Removed"}
                    </th>
                  ) : (
                    <>
                      <th className="px-4 py-2 font-semibold text-gray-600 border-b border-[#ebeef0]">
                        Key
                      </th>
                      <th className="px-4 py-2 font-semibold text-gray-600 border-b border-[#ebeef0]">
                        Value
                      </th>
                    </>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-[#ebeef0]">
                {log.value.map((v: any, i: number) => (
                  <tr key={i} className="hover:bg-[#f9fafb]">
                    <td className="px-4 py-2 font-mono text-blue-600">
                      {v.id}
                    </td>

                    {log.operation === "Tags-removed" ||
                      log.operation === "Tags-Added" ? (
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1.5 max-h-[80px] overflow-y-auto custom-scrollbar">
                          {(log.operation === "Tags-removed"
                            ? v.removedTags
                            : v.tagList?.split(","))?.map((tag: string, idx: number) => (
                              <span
                                key={idx}
                                className={`px-2 py-0.5 border rounded text-xs font-medium ${log.operation === "Tags-removed"
                                  ? "bg-red-50 text-red-700 border-red-200"
                                  : "bg-green-50 text-green-700 border-green-200"
                                  }`}
                              >
                                {tag.trim()}
                              </span>
                            ))}
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-2">
                          <div className="font-medium text-[#202223]">
                            {v.data?.key}
                          </div>
                          <div className="text-[10px] text-gray-500 mt-0.5">
                            {typeof v.data?.type === "object"
                              ? v.data?.type?.name
                              : v.data?.type}
                          </div>
                        </td>

                        <td className="px-4 py-2">
                          <pre className="whitespace-pre-wrap text-[11px] bg-gray-50 p-2 rounded border border-[#e1e3e5] text-gray-700 font-mono">
                            {v.data?.value || "—"}
                          </pre>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}
