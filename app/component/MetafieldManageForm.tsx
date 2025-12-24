import { Database, FileDown, Search, ArrowLeft, Trash2, CheckCircle2, FileText, AlertTriangle, RefreshCw } from "lucide-react";

export const MetafieldFetcherUI = ({
  objectType,
  setObjectType,
  queryMap,
  fetchMetafields,
  loading,
  isDeleting,
  metafields,
  resetToHome,
  hasSearched,
}) => (
  <div className="flex flex-col mb-6 bg-white p-5 rounded-lg border border-[#dfe3e8] shadow-sm">
    <div className="flex flex-col sm:flex-row items-end gap-3">
      <div className="flex-1 w-full">
        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 ml-1">
          Select Resource
        </label>

        {metafields.length === 0 ? (
          <select
            value={objectType}
            onChange={(e) => setObjectType(e.target.value)}
            disabled={loading || isDeleting}
            className="w-full h-11 border border-[#babfc3] px-3 py-2 cursor-pointer rounded-md focus:border-black focus:ring-1 focus:ring-black outline-none transition-all disabled:bg-[#fafbfb] text-base"
          >
            {Object.entries(queryMap).map(([key]) => (
              <option key={key} value={key}>
                {key.charAt(0).toUpperCase() + key.slice(1)}
              </option>
            ))}
          </select>
        ) : (
          <button
            onClick={resetToHome}
            className="h-11 bg-black cursor-pointer text-white px-4 py-2 rounded-md font-bold text-base hover:bg-gray-800 transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft size={18} />
            Reset
          </button>
        )}
      </div>

      <div className="flex-shrink-0 w-full sm:w-auto">
        {metafields.length === 0 && (
          <button
            disabled={loading || isDeleting}
            onClick={fetchMetafields}
            className="w-full sm:w-auto h-11 bg-black cursor-pointer text-white px-6 py-2 rounded-md font-bold text-base hover:bg-gray-800 disabled:bg-gray-200 transition-all flex items-center justify-center gap-2"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Search size={18} />
            )}
            Fetch Data
          </button>
        )}
      </div>
    </div>

    {hasSearched && metafields.length === 0 && !loading && (
      <div className="mt-4 p-4 bg-[#fff4e5] border border-[#ffebcc] text-[#664d03] rounded-md flex items-center gap-3 text-sm animate-in fade-in">
        <AlertTriangle size={18} />
        <span>
          <strong>No metafields found.</strong> Try selecting a different object
          type.
        </span>
      </div>
    )}
  </div>
);


export const MetafieldListUI = ({ metafields, handleMetafieldSelection, isDeleting }) => {
  if (metafields.length === 0) return null;

  return (
    <div className="space-y-3 mt-4">
      <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Available Metafields</h3>
      <div className="max-h-[500px] overflow-y-auto space-y-2 pr-2">
        {metafields.map((m, i) => (
          <label
            key={i}
            className="flex items-center group border border-[#dfe3e8] rounded-lg p-4 cursor-pointer bg-white hover:border-black transition-all hover:shadow-sm"
          >
            <input
              type="radio"
              className="w-4 h-4 accent-black mr-4"
              onChange={() => handleMetafieldSelection(m)}
              disabled={isDeleting}
            />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-400 font-mono">{m.namespace}</span>
                <span className="text-gray-300">/</span>
                <h2 className="font-bold text-[#202223]">{m.key}</h2>
              </div>
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                <span className="px-2 py-0.5 bg-gray-100 rounded text-[10px] font-bold uppercase tracking-tight">
                  {m?.type?.name || m?.type || "Standard"}
                </span>
              </p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
};

export const MetafieldRemoverUI = ({
  selectedMetafield, removeMode, setRemoveMode, handleCSVUpload, confirmDelete,
  handleupdateCSVUpload, loading, isDeleting, progress, backToSelectedFeild,
  specificField, setSpecificField, csvType, handleDownloadTemplate, csvData, results,
  fileName, handleClearCSV, listUpdateMode, setListUpdateMode, listRemoveMode, setListRemoveMode,
}) => (
  <div className="mt-6 bg-white border border-[#dfe3e8] rounded-lg overflow-hidden shadow-sm animate-in slide-in-from-top-4">
    {/* Header */}
    <div className="bg-[#fafbfb] p-4 border-b border-[#f1f2f3] flex justify-between items-center">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-black text-white rounded">
          <Database size={20} />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-900">Configure Task</h2>
          <p className="text-sm text-gray-500 font-mono">{selectedMetafield.namespace}.{selectedMetafield.key}</p>
        </div>
      </div>
    </div>

    <div className="p-5 space-y-4">
      {/* Operation Modes */}
      <div className="space-y-2">
        {[
          { id: "all", label: "Global Deletion", desc: "Remove this metafield from every item in your store." },
          { id: "specific", label: "Targeted Removal", desc: "Delete only from IDs provided in your CSV." },
          { id: "update", label: "Bulk Update/Add", desc: "Upload CSV to overwrite or add new values." }
        ].map((mode) => (
          <label key={mode.id} className={`block p-4 border rounded-lg cursor-pointer transition-all ${removeMode === mode.id ? 'border-black bg-gray-50 ring-1 ring-black' : 'border-[#dfe3e8] hover:border-gray-300'}`}>
            <div className="flex items-start gap-3">
              <input type="radio" checked={removeMode === mode.id} onChange={() => setRemoveMode(mode.id)} disabled={isDeleting} className="mt-1.5 w-4 h-4 accent-black" />
              <div>
                <span className="block font-bold text-base text-gray-900">{mode.label}</span>
                <span className="block text-sm text-gray-500 mt-0.5">{mode.desc}</span>
              </div>
            </div>

            {removeMode === mode.id && mode.id !== 'all' && (
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-3 animate-in fade-in duration-200">
                {selectedMetafield?.type?.name?.startsWith("list.") && (
                  <div className="mb-4 p-3 bg-white rounded border border-gray-200 shadow-sm">
                    <span className="block text-xs font-bold uppercase text-gray-500 mb-2">
                      {mode.id === "specific" ? "Removal Strategy" : "Update Strategy"}
                    </span>
                    <div className="flex flex-col sm:flex-row gap-4">
                      {mode.id === "specific" ? (
                        <>
                          <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-black transition-colors">
                            <input
                              type="radio"
                              checked={listRemoveMode === "full"}
                              onChange={() => setListRemoveMode("full")}
                              className="accent-black w-4 h-4"
                              disabled={isDeleting}
                            />
                            <span className="text-gray-700 font-medium">Delete Metafield Completely</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-black transition-colors">
                            <input
                              type="radio"
                              checked={listRemoveMode === "partial"}
                              onChange={() => setListRemoveMode("partial")}
                              className="accent-black w-4 h-4"
                              disabled={isDeleting}
                            />
                            <span className="text-gray-700 font-medium">Remove Specific Values</span>
                          </label>
                        </>
                      ) : (
                        <>
                          <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-black transition-colors">
                            <input
                              type="radio"
                              checked={listUpdateMode === "merge"}
                              onChange={() => setListUpdateMode("merge")}
                              className="accent-black w-4 h-4"
                              disabled={isDeleting}
                            />
                            <span className="text-gray-700 font-medium">Merge/Append Values</span>
                          </label>
                          <label className="flex items-center gap-2 text-sm cursor-pointer hover:text-black transition-colors">
                            <input
                              type="radio"
                              checked={listUpdateMode === "replace"}
                              onChange={() => setListUpdateMode("replace")}
                              className="accent-black w-4 h-4"
                              disabled={isDeleting}
                            />
                            <span className="text-gray-700 font-medium">Replace Entire List</span>
                          </label>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {csvData === 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                          <input type="radio" checked={specificField === "Id"} onChange={() => setSpecificField("Id")} className="accent-black w-4 h-4" /> ID
                        </label>
                        <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                          <input type="radio" checked={specificField === csvType} onChange={() => setSpecificField(csvType)} className="accent-black w-4 h-4" /> {csvType}
                        </label>
                      </div>
                      <button onClick={handleDownloadTemplate} className="text-xs cursor-pointer text-[#008060] flex items-center gap-1 hover:text-black transition-colors">
                        <FileDown size={14} /> Sample CSV
                      </button>
                    </div>

                    {/* Styled File Input Container */}
                    <div className="relative group">
                      <input
                        type="file" accept=".csv"
                        onChange={
                          mode.id === "update" ||
                            (mode.id === "specific" && listRemoveMode === "partial")
                            ? handleupdateCSVUpload
                            : handleCSVUpload
                        }
                        disabled={isDeleting}
                        className="block w-full text-sm text-gray-500 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:text-xs file:font-bold file:bg-black file:text-white file:cursor-pointer cursor-pointer border border-dashed border-[#babfc3] p-2 rounded-md hover:bg-white transition-colors"
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1 ml-1">
                      Only 5000 records will add at a time
                    </p>
                  </>
                )}

                {/* Improved File Status UX */}
                {csvData > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-md text-[#008060] text-sm font-bold">
                    <CheckCircle2 size={16} />
                    <span className="truncate max-w-[200px]">{fileName}</span>
                    <span className="text-gray-400">|</span>
                    <span>{csvData} Records Loaded Successfully</span>
                    <button
                      onClick={handleClearCSV}
                      disabled={progress > 0}
                      className={`ml-auto text-xs font-bold uppercase tracking-wider border px-2 py-1 rounded transition-colors
    ${progress > 0 && isDeleting
                          ? "text-red-300 border-red-200 bg-gray-100 cursor-not-allowed pointer-events-none opacity-50"
                          : "text-red-600 border-red-200 bg-white hover:text-red-800 hover:bg-red-50"
                        }
  `}
                    >
                      Remove
                    </button>

                  </div>
                )}
              </div>
            )}
          </label>
        ))}
      </div>

      {/* Progress Section */}
      {isDeleting && (
        <div className="py-2 animate-in fade-in">
          <div className="flex justify-between text-[10px] font-bold uppercase text-gray-500 mb-1">
            <span>Processing Records</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div className="bg-black h-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {/* Footer Actions */}
      <div className="flex items-center gap-3 pt-5 border-t border-[#f1f2f3]">
        <button
          disabled={isDeleting || loading || (removeMode !== 'all' && !csvData)}
          onClick={confirmDelete}
          className={`flex-1 text-white h-11 rounded-md font-bold text-base cursor-pointer hover:opacity-90 disabled:bg-gray-200 disabled:text-gray-400 transition-all flex items-center justify-center gap-2 ${removeMode === 'update' ? 'bg-black' : 'bg-red-600 hover:bg-red-700'}`}
        >
          {isDeleting ? "Processing..." : (
            <>
              {removeMode === 'update' ? <RefreshCw size={18} /> : <Trash2 size={18} />}
              {removeMode === 'update' ? "Run Update" : "Run Operation"}
            </>
          )}
        </button>
        {!isDeleting && (
          <button className="px-6 h-11 text-base font-bold border border-[#dfe3e8] rounded-md cursor-pointer hover:bg-gray-50 transition-all" onClick={backToSelectedFeild}>
            Back
          </button>
        )}
      </div>
    </div>

    {/* Live Results Log - UX Adjusted */}
    {results && results.length > 0 && removeMode !== "all" && (
      <div className="bg-[#fafbfb] border-t border-[#dfe3e8]">
        <div className="p-3 flex justify-between items-center text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          <span>Real-time Logs</span>
          <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">{results.length} Total</span>
        </div>
        <div className="max-h-40 overflow-y-auto divide-y divide-[#f1f2f3] border-t border-[#f1f2f3]">
          {[...results].reverse().map((r, idx) => (
            <div key={idx} className="px-4 py-2 flex justify-between items-center text-[10px] font-mono">
              <span className="text-gray-400">#{results.length - idx}</span>
              <span className="flex-1 px-4 truncate text-gray-600">{r.id}</span>
              <span className={`font-bold ${r.success ? "text-[#008060]" : "text-red-700"}`}>
                {r.success ? "OK" : "ERR"}
              </span>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

export const CompletionResultsUI = ({ results, downloadResultsCSV, resetToHome, removeMode }) => (
  <div className="mt-8 p-6 bg-[#f1f8f5] border border-[#bbe5b3] rounded-xl flex flex-col items-center text-center animate-in zoom-in-95">
    <CheckCircle2 size={48} className="text-[#008060] mb-4" />
    <h3 className="text-xl font-bold text-[#202223] mb-1">Process Completed</h3>
    <p className="text-sm text-[#008060] mb-6 font-medium">The metafield operation finished successfully.</p>

    <div className="flex items-center gap-3">
      {results.length > 0 && (
        <button
          className="bg-black text-white px-6 py-2 rounded-md font-bold cursor-pointer text-sm hover:bg-gray-800 transition-all flex items-center gap-2 shadow-md"
          onClick={() => downloadResultsCSV(results, removeMode)}
        >
          <FileText size={16} /> Download CSV Report
        </button>
      )}
      <button
        className="bg-white text-gray-900 border border-[#dfe3e8] px-6 py-2 cursor-pointer rounded-md font-bold text-sm hover:bg-gray-50 transition-all"
        onClick={resetToHome}
      >
        Done
      </button>
    </div>
  </div>
);

export const MetafieldEmptyStateUI = () => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center flex flex-col items-center justify-center h-full min-h-[300px] mt-6">
    <div className="bg-gray-50 p-4 rounded-full mb-4">
      <Search size={48} className="text-gray-300" />
    </div>
    <h3 className="text-xl font-semibold text-gray-900 mb-2">Ready to Search</h3>
    <p className="text-gray-500 max-w-sm mx-auto">
      Select a resource type above and click "Fetch Data" to see available metafields.
    </p>
  </div>
);

export const MetafieldLoadingUI = ({ objectType }: { objectType: string }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center flex flex-col items-center justify-center h-full min-h-[400px] mt-6">
    <div className="relative mb-6">
      <div className="w-12 h-12 border-4 border-gray-100 border-t-black rounded-full animate-spin"></div>
      <Search size={20} className="absolute inset-0 m-auto text-gray-400" />
    </div>
    <h3 className="text-xl font-semibold text-gray-900 mb-2">Scanning Store Metafields</h3>
    <p className="text-gray-500 max-w-xs mx-auto mb-4">
      Searching through your {objectType}s to find available metafields.
    </p>
    <div className="flex gap-1 justify-center">
      <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:-0.3s]"></span>
      <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:-0.15s]"></span>
      <span className="w-2 h-2 bg-black rounded-full animate-bounce"></span>
    </div>
  </div>
);
