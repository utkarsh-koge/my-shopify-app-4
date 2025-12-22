import React from "react";
import { History, Eye, RotateCcw, User, Clock, FileText, ChevronDown, ChevronUp } from "lucide-react";

export function LogsTable({ logs, openRow, setOpenRow, handleRestore, isLoading }) {
  // Stable wrapper height to prevent page jumping
  const wrapperClass = "bg-white rounded-xl border border-[#dfe3e8] shadow-sm overflow-hidden max-w-7xl mx-auto mt-5 mb-10 flex flex-col";
  const fixedHeight = "h-[650px]"; // Adjusted to fit roughly 10 rows + headers

  if (isLoading) {
    return (
      <div className={`${wrapperClass} ${fixedHeight} items-center justify-center`}>
        <div className="w-10 h-10 border-4 border-gray-100 border-t-black rounded-full animate-spin mb-4"></div>
        <h3 className="text-sm font-bold text-gray-900 uppercase tracking-widest">Loading History</h3>
      </div>
    );
  }

  if (!logs || logs.length === 0) {
    return (
      <div className={`${wrapperClass} ${fixedHeight} items-center justify-center text-center`}>
        <div className="bg-gray-50 p-4 rounded-full mb-4 text-gray-300">
          <History size={48} />
        </div>
        <h3 className="text-lg font-bold text-gray-900">No activity yet</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-xs px-6">
          Your bulk operation history and restore points will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className={`${wrapperClass} ${fixedHeight}`}>
      {/* Fixed Header - Does not scroll */}
      <div className="px-6 py-4 border-b border-[#f1f2f3] bg-[#fafbfb] flex items-center gap-2 shrink-0">
        <History size={18} className="text-gray-500" />
        <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wider">History table</h2>
      </div>

      {/* Scrollable Table Area */}
      <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr className="bg-[#fafbfb]">
              <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-[#dfe3e8] bg-[#fafbfb]">User</th>
              <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-[#dfe3e8] bg-[#fafbfb]">Operation</th>
              <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-[#dfe3e8] bg-[#fafbfb]">Details</th>
              <th className="px-6 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-[#dfe3e8] bg-[#fafbfb]">Action</th>
              <th className="px-6 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider border-b border-[#dfe3e8] bg-[#fafbfb]">Timestamp</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#f1f2f3]">
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

    </div>
  );
}

// Sub-components LogRow and LogDetailsRow remain largely the same, 
// but ensure they use standard table cells to respect the layout.

export function LogRow({ log, index, openRow, setOpenRow, handleRestore }) {
  const isOpen = openRow === index;

  return (
    <tr className={`hover:bg-[#fafbfb] transition-colors ${isOpen ? 'bg-[#fafbfb]' : ''}`}>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-2 text-[#202223] font-medium">
          <User size={14} className="text-gray-400" />
          {log.userName}
        </div>
      </td>
      <td className="px-6 py-4">
        <span className="text-[#202223] font-semibold">{log.operation}</span>
        {log.objectType && (
          <span className="block text-[10px] font-bold text-gray-400 uppercase tracking-tighter mt-0.5">
            {log.objectType}
          </span>
        )}
      </td>

      <td className="px-6 py-4">
        <button
          onClick={() => setOpenRow(isOpen ? null : index)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#dfe3e8] text-[#202223] rounded-md shadow-sm hover:bg-gray-50 transition text-xs font-bold whitespace-nowrap"
        >
          {isOpen ? <ChevronUp size={14} /> : <Eye size={14} />}
          {isOpen ? 'Close' : 'View Data'}
        </button>
      </td>

      <td className="px-6 py-4">
        <button
          onClick={() => handleRestore(log)}
          disabled={!log.restore}
          className={`flex items-center gap-2 px-4 py-1.5 rounded-md text-xs font-bold transition-all whitespace-nowrap ${log.restore
            ? "bg-black text-white hover:bg-gray-800 shadow-md"
            : "bg-gray-100 text-gray-400 cursor-not-allowed border border-[#dfe3e8]"
            }`}
        >
          <RotateCcw size={14} />
          Undo
        </button>
      </td>

      <td className="px-6 py-4 text-right text-gray-500 font-mono text-xs">
        <div className="flex flex-col items-end">
          <span className="text-[#202223] font-medium">{new Date(log.time).toLocaleDateString()}</span>
          <span className="text-[10px] text-gray-400">{new Date(log.time).toLocaleTimeString()}</span>
        </div>
      </td>
    </tr>
  );
}

export function LogDetailsRow({ log }) {
  return (
    <tr className="bg-[#f9fafb]">
      <td colSpan={5} className="px-8 py-6 border-b border-[#dfe3e8]">
        <div className="bg-white border border-[#dfe3e8] shadow-inner rounded-xl overflow-hidden max-w-4xl mx-auto">
          <div className="px-4 py-2 bg-gray-50 border-b border-[#dfe3e8] flex items-center gap-2">
            <FileText size={14} className="text-gray-400" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Operation Payload</span>
          </div>

          <div className="w-full overflow-x-auto max-h-[300px]">
            {/* Inner table for nested data */}
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white shadow-sm">
                <tr>
                  <th className="px-4 py-2 text-left font-bold text-gray-400 uppercase tracking-tighter">Resource ID</th>
                  {log.operation === "Tags-removed" || log.operation === "Tags-Added" ? (
                    <th className="px-4 py-2 text-left font-bold text-gray-400 uppercase tracking-tighter">
                      {log.operation === "Tags-Added" ? "Tags Added" : "Tags Removed"}
                    </th>
                  ) : (
                    <>
                      <th className="px-4 py-2 text-left font-bold text-gray-400 uppercase tracking-tighter">Key</th>
                      <th className="px-4 py-2 text-left font-bold text-gray-400 uppercase tracking-tighter">Value</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f2f3]">
                {log.value.map((v, i) => (
                  <tr key={i} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-[10px] text-blue-600 font-medium">{v.id}</td>
                    {(log.operation === "Tags-removed" || log.operation === "Tags-Added") ? (
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(log.operation === "Tags-removed" ? v.removedTags : v.tagList?.split(","))?.map((tag, idx) => (
                            <span key={idx} className={`px-2 py-0.5 border rounded text-[9px] font-bold ${log.operation === "Tags-removed" ? "bg-red-50 text-red-700 border-red-100" : "bg-green-50 text-green-700 border-green-100"}`}>
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      </td>
                    ) : (
                      <>
                        <td className="px-4 py-3 font-medium text-[#202223]">
                          {v.data?.key}
                          <span className="block text-[9px] text-gray-400 italic">
                            {typeof v.data?.type === "object" ? v.data?.type?.name : v.data?.type}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <pre className="whitespace-pre-wrap text-[9px] bg-gray-50 p-2 rounded border border-[#dfe3e8] text-gray-600 font-mono">
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