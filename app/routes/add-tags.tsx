import { useState, useEffect } from "react";
import { useFetcher, useNavigate, useLoaderData } from "react-router";
import Papa from "papaparse";
import { authenticate } from "../shopify.server";
import Navbar from "app/componant/app-nav";
import type { LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import ConfirmationModal from "../componant/confirmationmodal";
import { fetchResourceId } from "app/functions/remove-tag-action";

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

export default function SimpleTagManager() {
  const fetcher = useFetcher();
  const { apiKey } = useLoaderData<typeof loader>();

  interface Result {
    id?: string;
    success?: boolean;
    errors?: { message: string }[];
    index?: number;
  }

  const [objectType, setObjectType] = useState("product");
  const [csvData, setCsvData] = useState<{ id: string }[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [progress, setProgress] = useState(0);

  // Manual Tag Input State
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [csvType, setcsvType] = useState("Id"); // default selected
  const [specificField, setSpecificField] = useState("Id"); // default selected
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [flag, setflag] = useState(false); // default selected

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
      setIsRunning(false); // ✅ Finished
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

  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0];

    // Clear state if user cancels file selection
    if (!file) {
      setCsvData([]);
      setResults([]);
      setProgress(0);
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,

      complete: (res) => {
        const normalizedField = specificField.toLowerCase(); // "id" or "sku"

        const rows = res.data
          .map((row) => {
            // Normalize CSV headers
            const normalizedRow = Object.keys(row).reduce((acc, key) => {
              acc[key.toLowerCase()] = row[key];
              return acc;
            }, {});

            const value = normalizedRow[normalizedField];

            return {
              id: typeof value === "string" ? value.trim() : value,
            };
          })
          .filter((r) => r.id);

        if (rows.length > 5000) {
          alert("You can only upload a maximum of 5000 records at a time.");
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
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const handleClearCSV = () => {
    setCsvData([]);
    setResults([]);
    setProgress(0);
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  // -----------------------------------------------------
  // 1. Open modal instead of directly running handleSubmit
  // -----------------------------------------------------
  const openConfirmModal = () => {
    // if (!csvData.length || !tags.length) return;
    // CSV required for BOTH: specific delete AND update
    if (!csvData.length) {
      return alert(`Upload a CSV file with ${specificField}'s.`);
    }

    setModalState({
      isOpen: true,
      title: "Confirm Bulk Operation",
      message: `Are you sure you want to add ${tags.length} tag(s) to ${csvData.length} item(s)?`,
    });
  };

  // -----------------------------------------------------
  // 2. Handle Confirm -> runs the original handleSubmit logic
  // -----------------------------------------------------
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

    // ✅ Determine correct identifier header
    const identifierHeader = specificField === "Id" ? "Id" : csvType;
    console.log(specificField, ".....identifierHeader");
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
    // Freeze values at the moment of click
    const currentField = specificField;
    const currentType = csvType;
    const currentObjectType = objectType;

    // Determine header
    const header = currentField === "Id" ? "Id" : currentType;
    console.log(header, ".....console.");
    // Build sample values
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

    // Build CSV
    const csvContent = [header, ...sampleValues].join("\n");

    // Create Blob
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    // Create download link
    const link = document.createElement("a");
    link.href = url;

    // Get time only (HH-MM-SS)
    const pad = (n) => n.toString().padStart(2, "0");
    const d = new Date();
    const timeOnly = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

    // Use time-only as suffix
    link.download = `sample-${header}-template-${timeOnly}.csv`;

    // Trigger download
    link.click();

    // Cleanup
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (!isRunning && progress === 100) {
      console.log(results, "........specificField");

      // Build rows array once
      const rows = results.map((r) => ({
        id: r.id ?? "",
        tagList: Array.isArray(tags) ? tags.join(", ") : "",
        success: r.success ? "true" : "false",
        error: r.success
          ? ""
          : (r.errors?.map((e) => e.message).join("; ") ?? "")
      }));

      const Data = {
        operation: "Tags-Added",
        objectType,
        value: rows as { id: string; tagList: string; success: string; error: string }[]
      };

      fetcher.submit(Data, {
        method: "POST",
        action: "/api/add/db",
        encType: "application/json"
      });
    }
  }, [results, progress]);
  return (
    <AppProvider embedded apiKey={apiKey}>
      <div className="max-w-4xl mx-auto p-6 font-sans text-gray-900 border rounded-2xl mt-20">
        <Navbar />

        <div className="mb-8 border-b border-gray-200 pb-4 flex justify-between items-center">
          <div className="text-left">
            <h1 className="text-2xl font-bold mb-4">Add bulk Tag</h1>
          </div>
        </div>

        {/* Object Type */}
        <div className="mb-4">
          <label className="block mb-1 font-medium">Object Type</label>
          <select
            className="border px-3 py-2 rounded-md"
            value={objectType}
            onChange={(e) => setObjectType(e.target.value)}
            disabled={!isFinished && csvData.length > 0}
          >
            <option value="product">Product</option>
            <option value="customer">Customer</option>
            <option value="order">Order</option>
            <option value="blogpost">BlogPost</option>
          </select>
        </div>

        {/* Manual Tag Input */}
        <div
          className={`mb-6 p-4 bg-gray-50 rounded-md border ${csvData.length > 0 ? "opacity-50" : ""}`}
        >
          <label className="block mb-2 font-medium">Tags to Add</label>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={tagInput}
              onChange={(e) => {
                setTagInput(e.target.value);
                setTagError(null);
              }}
              onKeyDown={handleKeyDown}
              disabled={isSubmitting || csvData.length > 0 || isFinished}
              placeholder="Enter tag (Min 2 chars)"
              className="border rounded p-2 max-w-md w-full"
            />
            <button
              onClick={handleAddTag}
              disabled={
                isSubmitting ||
                tagInput.trim().length < 2 ||
                csvData.length > 0 ||
                isFinished
              }
              className="bg-gray-200 hover:bg-gray-300 text-black px-4 py-2 rounded-md transition disabled:opacity-50 whitespace-nowrap"
            >
              Add Tag
            </button>
          </div>
          {tagError && (
            <p className="text-red-600 text-sm mb-2">{tagError}</p>
          )}

          {/* Tag Pills */}
          <div className="flex flex-wrap gap-2">
            {tags.map((tag, idx) => (
              <span
                key={idx}
                className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm flex items-center gap-2"
              >
                {tag}
                {!isSubmitting && csvData.length === 0 && !isFinished && (
                  <button
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-blue-900 font-bold"
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {tags.length === 0 && (
              <span className="text-gray-400 text-sm italic">
                No tags added yet
              </span>
            )}
          </div>
        </div>

        {/* CSV Upload - Only show if tags are added */}
        {tags.length > 0 && (
          <div className="mb-4">
            {/* CSV Mode Selection */}
            <label className="block mb-1 font-medium">
              Import CSV ({csvType} column only)
            </label>

            <div className="flex items-center gap-6 mb-2 ml-1">
              {/* ID Option */}
              <label
                className={`flex items-center gap-1 ${isSubmitting ? "opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="specificField"
                  value="ID"
                  checked={specificField === "Id"}
                  onChange={() => setSpecificField("Id")}
                  disabled={isSubmitting}
                />
                IDs
              </label>

              {/* SKU Option */}
              <label
                className={`flex items-center gap-1 ${isSubmitting ? "opacity-50" : ""}`}
              >
                <input
                  type="radio"
                  name="specificField"
                  value={csvType}
                  checked={specificField === csvType}
                  onChange={() => setSpecificField(csvType)}
                  disabled={isSubmitting}
                />
                {csvType}
              </label>

              {/* Download Template */}
              <button
                type="button"
                onClick={handleDownloadTemplate}
                disabled={isSubmitting}
                className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-md text-sm border"
              >
                Download CSV Format
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              (Max 5000 records allowed)
            </p>
            {/* CSV Upload */}
            <input
              type="file"
              accept=".csv"
              onChange={handleCsvUpload}
              disabled={isSubmitting || isFinished}
              className="border rounded p-2 pl-4 w-full disabled:opacity-50"
            />

            {csvData.length > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-green-600">
                  {csvData.length}{" "}
                  {specificField === "Id" ? "Ids" : `${specificField}'s`} loaded
                </p>
              </div>
            )}
          </div>
        )}

        {/* Progress Bar */}
        {isSubmitting && (
          <div className="mb-4 w-full bg-gray-200 rounded-full h-4">
            <div
              className="bg-green-600 h-4 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          {/* Submit -> Opens Modal */}
          {!isFinished && (
            <div className="flex items-center gap-2">
              {/* Submit button */}
              <button
                onClick={openConfirmModal}
                disabled={isSubmitting || !tags.length}
                className={`bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 transition ${isSubmitting || !tags.length
                  ? "opacity-50 cursor-not-allowed"
                  : ""
                  }`}
              >
                {isSubmitting ? `Processing ${progress}%` : "Submit"}
              </button>

              {/* Clear CSV button */}
              {csvData.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCSV}
                  disabled={isSubmitting}
                  className={`text-sm font-medium text-red-600 hover:text-red-700 underline ${isSubmitting ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  title="Clear uploaded CSV"
                >
                  Clear CSV
                </button>
              )}

            </div>
          )}

          {/* Clear Button - Show when finished */}
          {isFinished && (
            <button
              onClick={handleClearAll}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition"
            >
              Clear & Start Again
            </button>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="mt-6">
            <h2 className="text-lg font-semibold mb-2">Results</h2>

            <div className="max-h-64 overflow-y-auto border p-3 rounded-md bg-gray-50">
              <ul className="text-sm">
                {results.map((r, idx) => (
                  <li
                    key={idx}
                    className={`mb-1 ${r.success ? "text-green-700" : "text-red-700"
                      }`}
                  >
                    <span className="font-bold mr-2">#{r.index}</span>
                    ID: {r.id} |{" "}
                    {r.success
                      ? "Success"
                      : `Error: ${r.errors?.map((e) => e.message).join("; ")}`}
                  </li>
                ))}
              </ul>
            </div>

            {isFinished && (
              <button
                onClick={downloadResults}
                className="mt-4 border border-black hover:bg-gray-100 text-black px-4 py-2 rounded-md transition"
              >
                Download CSV
              </button>
            )}
          </div>
        )}

        {/* ------------------------------------------- */}
        {/* CONFIRMATION MODAL (existing component used) */}
        {/* ------------------------------------------- */}
        <ConfirmationModal
          modalState={modalState}
          onConfirm={handleConfirm}
          setModalState={setModalState}
          confirmText="Yes, Proceed"
          cancelText="Cancel"
        />
      </div>
    </AppProvider>
  );
}
