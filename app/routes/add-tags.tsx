import { useState, useEffect } from "react";
import { useFetcher, useNavigate, useLoaderData } from "react-router";
import Papa from "papaparse";
import { authenticate } from "../shopify.server";
import Navbar from "app/componant/app-nav";
import type { LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import ConfirmationModal from "../componant/confirmationmodal";
import AlertModal from "app/componant/alert-modal";
import { fetchResourceId } from "app/functions/remove-tag-action";
import {
  Upload,
  Tag,
  X,
  FileDown,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Database
} from "lucide-react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);
    // eslint-disable-next-line no-undef
    return { apiKey: process.env.SHOPIFY_API_KEY || "" };
  } catch (error) {
    console.error("Loader error:", error);
    throw new Response("Unauthorized or Server Error", { status: 500 });
  }
};

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);

    const formData = await request.formData();

    const rowsRaw = formData.get("rows");
    const resourceType = formData.get("objectType");
    const flagRaw = formData.get("flag");

    let rows = [];
    let flag = false;

    try {
      rows = JSON.parse(rowsRaw || "[]");
      flag = JSON.parse(flagRaw || "false");
    } catch (parseError) {
      console.error("JSON Parse Error:", parseError);
      return {
        success: false,
        error: "Invalid data format received.",
        results: [],
      };
    }
    console.log("Flag value:", flag);
    const results = [];

    const mutation = `
      mutation tagOp($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors { field message }
        }
      } 
    `;
    for (const [index, row] of rows.entries()) {
      let resourceId = row.id;
      if (!flag) {
        const fetchedId = await fetchResourceId(
          admin,
          resourceType,
          resourceId,
        );
        console.log("Missing ID in row:", fetchedId);
        resourceId = fetchedId;
        if (!resourceId) {
          results.push({
            id: row.id,
            success: false,
            errors: [{ message: "Failed to fetch resource ID" }],
          });
          continue;
        }
      }

      if (!row.tags?.length) {
        results.push({
          id: row.id,
          success: false,
          errors: [{ message: "No tags provided" }],
        });
        continue;
      }

      try {
        const res = await admin.graphql(mutation, {
          variables: { id: resourceId, tags: row.tags },
        });

        const parsed = await res.json();
        const errors = parsed?.data?.tagsAdd?.userErrors || [];
        results.push({
          id: row.id,
          success: errors.length === 0,
          errors,
        });
      } catch (err) {
        results.push({
          id: row.id,
          success: false,
          errors: [{ message: err.message || "Unknown error" }],
        });
      }
    }

    // unchanged, as requested
    return { results };
  } catch (err) {
    return {
      success: false,
      error: err.message || "Something went wrong in tag add action.",
      results: [],
    };
  }
};

interface Result {
  id?: string;
  success?: boolean;
  errors?: { message: string }[];
  index?: number;
}

export default function SimpleTagManager() {
  const fetcher = useFetcher();
  const { apiKey } = useLoaderData<typeof loader>();
  const navigate = useNavigate()
  const [objectType, setObjectType] = useState("product");
  const [csvData, setCsvData] = useState<{ id: string }[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [progress, setProgress] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [csvType, setcsvType] = useState("Id"); // default selected
  const [specificField, setSpecificField] = useState("Id"); // default selected
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [alertState, setAlertState] = useState({ isOpen: false, title: "", message: "" });
  const [fileName, setFileName] = useState<string | null>(null);

  console.log(specificField, "........specificField");
  // Modal state
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: "",
    message: "",
  });

  useEffect(() => {
    if (!isRunning) return;
    if (!fetcher.data?.results) return;

    const result = fetcher.data.results[0];
    const nextIndex = currentIndex + 1;
    const total = csvData.length;

    // Store result (Newest on TOP)
    setResults((prev) => [{ ...result, index: nextIndex }, ...prev]);

    // Update progress AFTER response
    setProgress(Math.round((nextIndex / total) * 100));

    // Send next row ONLY after response
    if (nextIndex < total) {
      setCurrentIndex(nextIndex);
      sendRow(nextIndex);
    } else {
      setIsRunning(false);
    }
  }, [fetcher.data]);

  // Prevent reload/close while running
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRunning) {
        e.preventDefault();
        e.returnValue = ""; // Chrome requires returnValue to be set
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isRunning]);

  function getShopifyObjectTypeFromGid(gid) {
    if (typeof gid !== "string") return null;

    const match = gid.match(/^gid:\/\/shopify\/([^/]+)\/\d+$/);
    return match ? match[1].toLowerCase() : null;
  }

  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0];

    // Clear state if user cancels file selection
    if (!file) {
      return;
    }

    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,

      complete: (res) => {
        const normalizedField = specificField.toLowerCase(); // "id" or "sku"

        let hasInvalidGid = false;

        const rows = res.data
          .map((row) => {
            const normalizedRow = Object.keys(row).reduce((acc, key) => {
              acc[key.toLowerCase()] = row[key];
              return acc;
            }, {});

            const value = normalizedRow[normalizedField];
            const id = typeof value === "string" ? value.trim() : value;

            if (!id) return null;

            const gidObjectType = getShopifyObjectTypeFromGid(id);

            if (gidObjectType && gidObjectType !== objectType.toLowerCase()) {
              setAlertState({
                isOpen: true,
                title: "Invalid Shopify ID",
                message: `The CSV contains an ID of type "${gidObjectType}", but "${objectType}" was selected.\n\nID:\n${id}`,
              });

              hasInvalidGid = true;
              return null;
            }

            return { id };
          })
          .filter(Boolean);

        // ⛔ Stop further execution if validation failed
        if (hasInvalidGid) {
          return;
        }

        if (rows.length > 5000) {
          setAlertState({
            isOpen: true,
            title: "Limit Exceeded",
            message: "You can only upload a maximum of 5000 records at a time.",
          });
          setCsvData([]);
          setProgress(0);
          setResults([]);
          e.target.value = null;
          return;
        }
        if (rows.length === 0) {
          setAlertState({
            isOpen: true,
            title: "Valid Record Not Found",
            message: "No valid records found in the CSV file.",
          });
          setCsvData([]);
          setProgress(0);
          setResults([]);
          e.target.value = null;
          return;
        }
        setCsvData(rows);
        setProgress(0);
        setResults([]);
      },
    });
  };

  useEffect(() => {
    setCsvData([]);
    setResults([]);
    setProgress(0);
    setTags([]);
    setTagInput("");
    setSpecificField("Id");
    setFileName(null);
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  }, [objectType]);

  useEffect(() => {
    setCsvData([]);
    console.log("CSV TYPE CHANGED");
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  }, [specificField]);

  // Tag Input Handlers
  const handleAddTag = () => {
    const trimmed = tagInput.trim();

    if (trimmed.length < 2) return;

    if (tags.includes(trimmed)) {
      setTagError("Tag already added");
      return;
    }

    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
      setTagError(null);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag();
    }
  };

  // Clear All Handler
  const handleClearAll = () => {
    setCsvData([]);
    setResults([]);
    setProgress(0);
    setTags([]);
    setTagInput("");
    setSpecificField("Id");
    setFileName(null);
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const handleClearCSV = () => {
    setCsvData([]);
    setResults([]);
    setProgress(0);
    setFileName(null);
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  // 1. Open modal instead of directly running handleSubmit
  const openConfirmModal = () => {
    // if (!csvData.length || !tags.length) return;
    // CSV required for BOTH: specific delete AND update
    if (!csvData.length) {
      return setAlertState({
        isOpen: true,
        title: "Missing CSV",
        message: `Upload a CSV file with ${specificField}'s.`,
      });
    }

    setModalState({
      isOpen: true,
      title: "Confirm Bulk Operation",
      message: `Are you sure you want to add ${tags.length} tag(s) to ${csvData.length} item(s)?`,
    });
  };

  // 2. Handle Confirm -> runs the original handleSubmit logic
  const handleConfirm = () => {
    setModalState((prev) => ({ ...prev, isOpen: false }));

    if (!csvData.length || !tags.length) return;

    setResults([]);
    setProgress(0);
    setCurrentIndex(0);
    setIsRunning(true);

    sendRow(0); // 🔹 send FIRST row only
  };

  const sendRow = (index: number) => {
    const row = csvData[index];
    if (!row) return;

    const fd = new FormData();
    fd.append("objectType", objectType);
    fd.append("flag", JSON.stringify(specificField === "Id"));
    fd.append(
      "rows",
      JSON.stringify([
        {
          id: row.id,
          tags,
        },
      ]),
    );

    fetcher.submit(fd, { method: "POST" });
  };

  const downloadResults = () => {
    if (!results.length) return;

    // CSV Header
    const header = [specificField, "Tags", "Success", "Error"].join(",") + "\n";

    // Escape helper for CSV safety
    const escapeCSV = (value: any) => {
      if (value === null || value === undefined) return "";
      return `"${String(value).replace(/"/g, '""')}"`;
    };

    const rows = results.map((r) => {
      const id = r.id ?? "";
      const tagList = Array.isArray(tags) ? tags.join(", ") : "";
      const success = r.success ? "true" : "false";
      const error = r.success
        ? ""
        : (r.errors?.map((e) => e.message).join("; ") ?? "");

      return [
        escapeCSV(id),
        escapeCSV(tagList),
        escapeCSV(success),
        escapeCSV(error),
      ].join(",");
    });

    const csvContent = header + rows.join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);

    // Time suffix (HH-MM-SS)
    const pad = (n: number) => n.toString().padStart(2, "0");
    const d = new Date();
    const timeOnly = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

    const link = document.createElement("a");
    link.href = url;
    link.download = `tag_manager_results-${timeOnly}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  };

  const isSubmitting = progress > 0 && progress < 100;
  const isFinished = progress === 100;

  useEffect(() => {
    if (objectType === "product") {
      setcsvType("Sku");
    }
    if (objectType === "customer") {
      setcsvType("Email");
    }
    if (objectType === "order") {
      setcsvType("Name");
    }
    if (objectType === "article") {
      setcsvType("Handle");
    }
  }, [objectType]);

  const handleDownloadTemplate = () => {
    const currentField = specificField;
    const currentType = csvType;
    const currentObjectType = objectType;

    const header = currentField === "Id" ? "Id" : currentType;
    console.log(header, ".....console.");
    let sampleValues = [];

    if (header === "Id") {
      const gidType =
        currentObjectType === "product"
          ? "Product"
          : currentObjectType === "customer"
            ? "Customer"
            : currentObjectType === "order"
              ? "Order"
              : currentObjectType === "article"
                ? "Article"
                : "Unknown";

      sampleValues = [
        `gid://shopify/${gidType}/123456789`,
        `gid://shopify/${gidType}/987654321`,
        `gid://shopify/${gidType}/555555555`,
        `gid://shopify/${gidType}/444444444`,
        `gid://shopify/${gidType}/333333333`,
      ];
    } else if (header === "Sku") {
      sampleValues = ["SKU-1", "SKU-2", "SKU-3", "SKU-4", "SKU-5"];
    } else if (header === "Email") {
      sampleValues = [
        "example1@mail.com",
        "example2@mail.com",
        "example3@mail.com",
        "example4@mail.com",
        "example5@mail.com",
      ];
    } else if (header === "Name") {
      sampleValues = ["#1001", "#1002", "#1003", "#1004", "#1005"];
    } else if (header === "Handle") {
      sampleValues = [
        "article-handle-1",
        "article-handle-2",
        "article-handle-3",
        "article-handle-4",
        "article-handle-5",
      ];
    }

    const csvContent = [header, ...sampleValues].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    // Get time only (HH-MM-SS)
    const pad = (n) => n.toString().padStart(2, "0");
    const d = new Date();
    const timeOnly = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

    link.download = `sample-${header}-template-${timeOnly}.csv`;

    link.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!isRunning && progress === 100) {
      // Take only successful results
      const successResults = results.filter((r) => r.success === true);

      const rows = successResults.map((r) => ({
        id: r.id ?? "",
        tagList: Array.isArray(tags) ? tags.join(", ") : "",
        success: "true",
        error: ""
      }));

      if (!rows.length) return;

      const Data = {
        operation: "Tags-Added",
        objectType,
        value: rows as {
          id: string;
          tagList: string;
          success: string;
          error: string;
        }[],
      };

      fetcher.submit(Data, {
        method: "POST",
        action: "/api/add/db",
        encType: "application/json",
      });
    }
  }, [results, progress]);

  return (
    <AppProvider embedded apiKey={apiKey}>
      <Navbar />

      <div className="min-h-screen bg-[#f1f2f4] py-10 px-4 font-sans text-[#202223] relative">
        <button
          onClick={() => navigate("/app")}
          className="absolute top-4 left-4 px-4 py-2 bg-white border border-[#dfe3e8] rounded-md hover:bg-gray-50 transition text-[#202223] shadow-sm cursor-pointer text-sm font-medium flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Go to home
        </button>
        <div className="max-w-[800px] mx-auto space-y-6">

          {/* Header Section */}
          <header className="flex justify-between items-end mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Bulk Tag Editor</h1>
            </div>
            {isFinished && (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-2 cursor-pointer text-sm font-medium text-red-600 hover:bg-red-50 px-3 py-2 rounded-md transition"
              >
                <RotateCcw size={16} /> Reset Form
              </button>
            )}
          </header>

          {/* Card 1: Configuration */}
          {!isFinished && (
            <>
              <section className="bg-white rounded-lg shadow-sm border border-[#dfe3e8] overflow-hidden">
                <div className="p-5 border-b border-[#f1f2f3] flex justify-between items-center bg-[#fafbfb]">
                  <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-600">1. Setup Resource</h2>
                  <Database size={18} className="text-gray-400" />
                </div>

                <div className="p-6 space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Select Object Type</label>
                    <select
                      className="w-full cursor-pointer bg-white border border-[#babfc3] rounded-md px-3 py-2 focus:border-[#008060] focus:ring-1 focus:ring-[#008060] outline-none transition-all disabled:bg-gray-50"
                      value={objectType}
                      onChange={(e) => setObjectType(e.target.value)}
                      disabled={isRunning || csvData.length > 0}
                    >
                      <option value="product">Products</option>
                      <option value="customer">Customers</option>
                      <option value="order">Orders</option>
                      <option value="blogpost">Blog Posts</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-2">Add Tags</label>
                    <div className="flex gap-2">
                      <div className="relative flex-1 ">
                        <Tag className="absolute left-3 top-2.5 text-gray-400" size={16} />
                        <input
                          type="text"
                          value={tagInput}
                          onChange={(e) => { setTagInput(e.target.value); setTagError(null); }}
                          onKeyDown={handleKeyDown}
                          disabled={isRunning || isFinished}
                          placeholder="e.g. Summer-Sale, VIP"
                          className="w-full pl-10 pr-3 py-2 border border-[#babfc3] rounded-md focus:border-black outline-none transition-all disabled:bg-gray-50 disabled:text-gray-400"
                        />
                      </div>
                      <button
                        onClick={handleAddTag}
                        disabled={tagInput.trim().length < 2 || isRunning || isFinished}
                        className="bg-black  text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-800 disabled:bg-gray-200 transition cursor-pointer"
                      >
                        Add
                      </button>
                    </div>
                    {tagError && <p className="text-red-600 text-xs mt-2">{tagError}</p>}

                    <div className="flex flex-wrap gap-2 mt-4">
                      {tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center  bg-[#f1f2f3] text-[#202223] px-3 py-1 rounded-full text-xs font-medium border border-[#dfe3e8]">
                          {tag}
                          {!isRunning && !isFinished && (
                            <button onClick={() => handleRemoveTag(tag)} className="ml-2 hover:text-red-600 cursor-pointer">
                              <X size={14} />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </section>

              {/* Card 2: Import */}
              {tags.length > 0 && (
                <section className="bg-white rounded-lg shadow-sm border border-[#dfe3e8] overflow-hidden">
                  <div className="p-5 border-b border-[#f1f2f3] bg-[#fafbfb] flex justify-between items-center">
                    <h2 className="font-semibold text-sm uppercase tracking-wider text-gray-600">2. Import Data</h2>
                    <Upload size={18} className="text-gray-400" />
                  </div>

                  <div className="p-6 space-y-4">
                    {csvData.length === 0 && (
                      <>
                        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-dashed border-[#babfc3]">
                          <div className="flex gap-4">
                            <label className={`flex items-center gap-2 text-sm cursor-pointer ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}>
                              <input
                                type="radio"
                                checked={specificField === "Id"}
                                onChange={() => setSpecificField("Id")}
                                className="accent-black"
                                disabled={isRunning}
                              />
                              Shopify GID
                            </label>
                            <label className={`flex items-center gap-2 text-sm cursor-pointer ${isRunning ? "opacity-50 cursor-not-allowed" : ""}`}>
                              <input
                                type="radio"
                                checked={specificField === csvType}
                                onChange={() => setSpecificField(csvType)}
                                className="accent-black"
                                disabled={isRunning}
                              />
                              {csvType}
                            </label>
                          </div>
                          <button
                            onClick={handleDownloadTemplate}
                            className={`text-xs cursor-pointer flex items-center gap-1 text-[#008060] font-medium hover:underline ${isRunning ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}
                            disabled={isRunning}
                          >
                            <FileDown size={14} /> Sample CSV
                          </button>
                        </div>

                        <input
                          type="file"
                          accept=".csv"
                          onChange={handleCsvUpload}
                          disabled={isRunning || isFinished}
                          className="block w-full text-sm text-blue-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-black hover:file:bg-gray-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                      </>
                    )}

                    {csvData.length > 0 && (
                      <div className="flex items-center gap-2 text-blue-700 text-sm font-medium bg-blue-50 p-2 rounded border border-blue-200">
                        <CheckCircle2 size={16} />
                        <span className="truncate max-w-[300px]">{fileName}</span>
                        <span className="text-gray-400">|</span>
                        <span>{csvData.length} records ready to process</span>
                        <button
                          onClick={handleClearCSV}
                          className="ml-auto text-red-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer "
                          disabled={isRunning}
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Action Bar */}
              <div className="flex items-center justify-between bg-white p-4 rounded-lg border border-[#dfe3e8] shadow-sm">
                <div className="flex-1 mr-4">
                  {isSubmitting && (
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className="bg-black h-2 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
                    </div>
                  )}
                </div>
                <button
                  onClick={openConfirmModal}
                  disabled={isRunning || !csvData.length}
                  className={`px-6 py-2 rounded-md font-semibold text-sm transition ${isRunning || !csvData.length
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-black text-white hover:bg-gray-900 shadow-md cursor-pointer"
                    }`}
                >
                  {isRunning ? `Processing ${progress}%` : "Run Update"}
                </button>
              </div>
            </>
          )}

          {/* Results Card */}
          {results.length > 0 && (
            <section className="bg-white rounded-lg shadow-sm border border-[#dfe3e8] overflow-hidden">
              <div className="p-5 border-b border-[#f1f2f3] flex justify-between items-center">
                <h2 className="font-semibold text-sm">Execution Logs</h2>
                {isFinished && (
                  <button onClick={downloadResults} className="text-sm cursor-pointer font-medium flex items-center gap-1 text-black border border-black px-3 py-1 rounded hover:bg-gray-50">
                    <FileDown size={14} /> Export Results
                  </button>
                )}
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-gray-100">
                {results.map((r, idx) => (
                  <div key={idx} className="p-3 px-6 flex items-center justify-between text-sm">
                    <span className="text-gray-500 tabular-nums">#{r.index}</span>
                    <span className="flex-1 px-4 font-mono text-xs truncate">{r.id}</span>
                    {r.success ? (
                      <span className="text-green-700 bg-green-50 px-2 py-0.5 rounded text-xs font-medium">Success</span>
                    ) : (
                      <span className="text-red-700 bg-red-50 px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1">
                        <AlertCircle size={12} /> Error
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <ConfirmationModal
          modalState={modalState}
          onConfirm={handleConfirm}
          setModalState={setModalState}
        />

        <AlertModal
          modalState={alertState}
          setModalState={setAlertState}
        />
      </div>
    </AppProvider>
  );
}
