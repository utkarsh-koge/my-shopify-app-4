import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import Navbar from "app/componant/app-nav";
import ConfirmationModal from "app/componant/confirmationmodal";
import type { LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import {
  handleFetch,
  handleRemoveFromAll,
  handleRemoveSpecific,
} from "app/functions/remove-tag-action";
import Papa from "papaparse";

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

/* ---------------- MAIN ACTION ---------------- */
export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const mode = formData.get("mode");

    if (mode === "fetch") {
      return await handleFetch(admin, formData);
    }

    // ---- GLOBAL REMOVE (MULTI TAG) ----
    if (mode === "remove-global") {
      return await handleRemoveFromAll(admin, formData);
    }

    // ---- SPECIFIC REMOVE (CSV + MULTIPLE TAGS) ----
    if (mode === "remove-specific") {
      return await handleRemoveSpecific(admin, formData);
    }

    return { error: "Invalid mode" };
  } catch (err) {
    console.error("Action error:", err);

    return {
      success: false,
      error: err.message || "Something went wrong in the action handler.",
    };
  }
};

export default function TagManager() {
  const fetcher = useFetcher();
  const { apiKey } = useLoaderData<typeof loader>();

  const [objectType, setObjectType] = useState("product");
  const [matchType, setMatchType] = useState("contain");

  const [conditions, setConditions] = useState([{ tag: "", operator: "OR" }]);
  const [fetchedItems, setFetchedItems] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);

  const [removalMode, setRemovalMode] = useState("global");
  const [csvIds, setCsvIds] = useState([]);
  const [modalState, setModalState] = useState({ isOpen: false });
  const [specificEnd, setspecificEnd] = useState(false);

  const [isRemoving, setIsRemoving] = useState(false);
  const [noTagsFound, setNoTagsFound] = useState(false);
  const [specificField, setSpecificField] = useState("Id"); // default selected
  const [csvType, setcsvType] = useState("Id"); // default selected
  const [currentrow, setcurrentrow] = useState(); // default selected
  const [allFetchedTags, setAllFetchedTags] = useState([]);
  const [isFetchingTags, setIsFetchingTags] = useState(false);
  // SPECIFIC MODE RESULTS
  const [finalSpecificResults, setFinalSpecificResults] = useState([]);
  const [csvIndex, setCsvIndex] = useState(1);
  const [Total, setTotal] = useState(0); // NEW


  // Prevent reload/close while running
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRemoving) {
        e.preventDefault();
        e.returnValue = ""; // Chrome requires returnValue to be set
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isRemoving]);



  // GLOBAL MODE PAGINATED RESULTS
  const [globalResult, setGlobalResult] = useState({
    results: [],
    totalProcessed: 0,
    success: true,
    complete: false,
    nextCursor: null,
  });

  const emptyGlobalState = {
    results: [],
    totalProcessed: 0,
    success: true,
    complete: false,
    nextCursor: null,
    mode: null,
  };

  // console.log(globalResult?.results, '......merger')
  // UI Disable Control
  const isFetching =
    fetcher.state !== "idle" && fetcher.formData?.get("mode") === "fetch";
  const isActionDisabled = isRemoving;

  /* ---------------- HANDLE ALL SERVER RESPONSES ---------------- */

  function filterTagsBasedOnConditions(allTags, conditions, matchType) {
    if (!conditions?.length) return allTags;

    const match = (tag, cond) => {
      const value = cond.tag.trim().toLowerCase();
      const t = tag.toLowerCase();

      switch (matchType) {
        case "exact":
          return t === value;
        case "start":
          return t.startsWith(value);
        case "end":
          return t.endsWith(value);
        default: // contain
          return t.includes(value);
      }
    };

    // Start with first condition
    let result = allTags.filter((tag) => match(tag, conditions[0]));

    // Apply AND / OR logic
    for (let i = 1; i < conditions.length; i++) {
      const cond = conditions[i];

      if (cond.operator === "AND") {
        result = result.filter((tag) => match(tag, cond));
      } else {
        const matches = allTags.filter((tag) => match(tag, cond));
        result = Array.from(new Set([...result, ...matches]));
      }
    }

    return result;
  }

  function startFetchTags() {
    setAllFetchedTags([]);
    setFetchedItems([]);
    setNoTagsFound(false);
    setIsFetchingTags(true);

    const fd = new FormData();
    fd.append("mode", "fetch");
    fd.append("objectType", objectType);

    fetcher.submit(fd, { method: "POST" });
  }

  useEffect(() => {
    if (!isFetchingTags && allFetchedTags.length > 0) {
      const uniqueTags = Array.from(new Set(allFetchedTags));
      const filtered = filterTagsBasedOnConditions(
        uniqueTags,
        conditions,
        matchType,
      );
      setFetchedItems(filtered);
      setNoTagsFound(filtered.length === 0);
    }
  }, [isFetchingTags]);

  useEffect(() => {
    if (!fetcher.data) return;

    const data = fetcher.data;

    // ---------------- FETCH MODE (Load matching tags) ----------------
    if (data.mode === "fetch" && data.success) {
      // 1. Collect ALL tags (no filtering here)
      setAllFetchedTags((prev) => [...prev, ...data.tags]);

      // 2. Continue pagination
      if (data.hasNextPage) {
        const fd = new FormData();
        fd.append("mode", "fetch");
        fd.append("objectType", objectType);
        fd.append("cursor", data.nextCursor);

        fetcher.submit(fd, { method: "POST" });
      } else {
        // 3. FETCH COMPLETE → APPLY FILTER ONCE
        setRemovalMode("global");
        setIsFetchingTags(false);
      }
    }

    // ---------------- SPECIFIC CSV REMOVE MODE ----------------
    if (data.mode === "remove-specific") {
      // Save result
      // console.log(data.results, ".........result");

      const updatedResults = data.results.map((item) => ({
        ...item,
        row: currentrow,
      }));

      setFinalSpecificResults((prev) => [...prev, ...updatedResults]);

      // Go to the next CSV row
      const nextIndex = csvIndex + 1;

      // If more rows left → process next one
      if (nextIndex < csvIds.length) {
        setCsvIndex(nextIndex);
        setcurrentrow(csvIds[nextIndex]);
        const fd = new FormData();
        fd.append("mode", "remove-specific");
        fd.append("tags", JSON.stringify(selectedTags));
        fd.append("row", JSON.stringify(csvIds[nextIndex]));
        fd.append("flag", JSON.stringify(specificField === "Id"));
        fd.append("resource", JSON.stringify(objectType));

        fetcher.submit(fd, { method: "POST" });
      } else {
        // All rows done
        setspecificEnd(true);
        setIsRemoving(false);
      }

      return;
    }

    // ---------------- GLOBAL REMOVE MODE (Paginated) ----------------
    if (data.mode === "remove-global") {
      setGlobalResult((prev) => {
        const merged = [...prev.results, ...(data.results || [])];

        return {
          ...prev,
          mode: "remove-global",
          results: merged,
          totalProcessed: merged.length,
          success: prev.success && data.success,
          complete: !data.hasNextPage,
          nextCursor: data.nextCursor || null,
        };
      });

      // Continue automatically when next page exists
      if (data.hasNextPage) {
        const fd = new FormData();
        fd.append("objectType", objectType);
        fd.append("tags", JSON.stringify(selectedTags));
        fd.append("mode", "remove-global");
        fd.append("cursor", data.nextCursor);

        setTimeout(() => {
          fetcher.submit(fd, { method: "POST" });
        }, 200); // Avoid rate-limit
      } else {
        // Finished all batches
        setIsRemoving(false);
      }

      return;
    }
  }, [fetcher.data]);

  /* ---------------- WRITE LOGS AFTER GLOBAL FINISH ---------------- */
  useEffect(() => {
    if (globalResult.complete && globalResult.results.length > 0) {
      const Data = {
        operation: "Tags-removed",
        objectType,
        value: globalResult.results,
      };

      fetcher.submit(JSON.stringify(Data), {
        method: "POST",
        action: "/api/add/db",
        encType: "application/json",
      });
    }
  }, [globalResult.complete]);

  /* ---------------- WRITE LOGS FOR SPECIFIC MODE ---------------- */
  useEffect(() => {
    if (finalSpecificResults.length === 0) return;

    const successRows = finalSpecificResults.filter((r) => r.success);
    if (successRows.length === 0) return;
    if (specificEnd) {
      const Data = {
        operation: "Tags-removed", objectType,
        value: successRows,
      };

      fetcher.submit(Data, {
        method: "POST",
        action: "/api/add/db",
        encType: "application/json",
      });
    }
  }, [specificEnd]);

  /* ---------------- DOWNLOAD CSV ---------------- */
  const downloadResultCSV = () => {
    let result = [];
    let header = "";
    let rows = [];

    /* ---------------- GLOBAL MODE ---------------- */
    if (removalMode === "global") {
      result = globalResult?.results;
      header = ["ID", "Tags", "Success", "Error"].join(",") + "\n";
      rows = result.map((r, idx) => {
        const id = r.id || "";
        const removedTags = Array.isArray(r.removedTags)
          ? r.removedTags.join(", ")
          : "";
        const success = r.success ? "true" : "false";
        const error = r.error || "";

        return `"${id}","${removedTags}","${success}","${error}"`;
      });
    } else {
      /* ---------------- SPECIFIC MODE ---------------- */
      result = finalSpecificResults;
      console.log(result, "csvidssssssssssss");
      header = [specificField, "Tags", "Success", "Error"].join(",") + "\n";

      rows = result.map((r, idx) => {
        const id = r.row || "";
        const removedTags = Array.isArray(r.removedTags)
          ? r.removedTags.join(", ")
          : "";
        const success = r.success ? "true" : "false";
        const error = r.error || "";

        return `"${id}","${removedTags}","${success}","${error}"`;
      });
    }

    const csvContent = header + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;

    const pad = (n) => n.toString().padStart(2, "0");
    const d = new Date();
    const timeOnly = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

    link.download = `tag-removal-results-${timeOnly}.csv`;

    link.click();

    URL.revokeObjectURL(url);
  };

  /* ---------------- ADD NEW TAG CONDITION ---------------- */
  const addCondition = () =>
    setConditions((prev) => [...prev, { tag: "", operator: "OR" }]);

  const updateCondition = (i, field, value) => {
    setConditions((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)),
    );
    setGlobalResult(emptyGlobalState);
    setFinalSpecificResults([]);
  };

  const removeCondition = (i) =>
    setConditions((prev) => prev.filter((_, idx) => idx !== i));

  /* ---------------- CANCEL ---------------- */
  const handleCancel = () => {
    setConditions([{ tag: "", operator: "OR" }]);
    setFetchedItems([]);
    setSelectedTags([]);
    setCsvIds([]);
    setGlobalResult(emptyGlobalState);
    setFinalSpecificResults([]);
    setNoTagsFound(false);
    setIsRemoving(false);
    setRemovalMode("global");
    setspecificEnd(false);
  };

  useEffect(() => {
    setCsvIds([]);
    setTotal(0);
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  }, [specificField, objectType, removalMode]);

  /* ---------------- CSV UPLOAD ---------------- */
  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0];

    // -----------------------------
    // 1. Cancel / reset handling
    // -----------------------------
    if (!file) {
      setCsvIds([]);
      setTotal(0);
      return;
    }

    // -----------------------------
    // 2. File validation
    // -----------------------------
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a valid CSV file.");
      e.target.value = null;
      setCsvIds([]);
      setTotal(0);
      return;
    }

    // Normalize selected field: "Id" → "id", "SKU" → "sku"
    const normalizedField = specificField.toLowerCase();

    // -----------------------------
    // 3. Parse CSV (production-safe)
    // -----------------------------
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.toLowerCase().trim(),

      complete: (res) => {
        if (!Array.isArray(res.data)) {
          alert("Invalid CSV format.");
          setCsvIds([]);
          setTotal(0);
          return;
        }

        // -----------------------------
        // 4. Extract values using specificField
        // -----------------------------
        const values = res.data
          .map((row) => {
            const value = row[normalizedField];
            return typeof value === "string" ? value.trim() : null;
          })
          .filter(Boolean);

        // -----------------------------
        // 5. Record limit enforcement
        // -----------------------------
        if (values.length > 5000) {
          alert("You can only upload a maximum of 5000 records at a time.");
          setCsvIds([]);
          setTotal(0);
          e.target.value = null;
          return;
        }

        // -----------------------------
        // 6. Commit state
        // -----------------------------
        setCsvIds(values);
        setTotal(values.length);

        // Allow re-upload of same file
        // e.target.value = null;
      },

      error: (err) => {
        console.error("CSV parsing failed:", err);
        alert("Failed to parse CSV file.");
        setCsvIds([]);
        setTotal(0);
        e.target.value = null;
      },
    });
  };

  /* ---------------- OBJECT TYPE CHANGE ---------------- */
  const handleObjectTypeChange = (e) => {
    const value = e.target.value;
    setObjectType(value);

    setConditions([{ tag: "", operator: "OR" }]);
    setFetchedItems([]);
    setSelectedTags([]);
    setCsvIds([]);
    setGlobalResult(emptyGlobalState);
    setFinalSpecificResults([]);
    setNoTagsFound(false);
    setspecificEnd(false);
  };

  /* ---------------- MODAL ---------------- */
  const openRemoveModal = () => {
    // CSV required for BOTH: specific delete AND update
    if (!csvIds.length && removalMode !== "global") {
      return alert(`Upload a CSV file with ${specificField}'s`);
    }
    setModalState({ isOpen: true });
  };

  /* ---------------- CONFIRM REMOVAL ---------------- */
  const handleConfirmRemoval = () => {
    setIsRemoving(true);
    setFinalSpecificResults([]);
    setGlobalResult(emptyGlobalState);

    const fd = new FormData();
    fd.append("objectType", objectType);
    fd.append("tags", JSON.stringify(selectedTags));

    if (removalMode === "global") {
      fd.append("mode", "remove-global");
    } else {
      if (!csvIds.length) {
        alert("Upload CSV first.");
        setIsRemoving(false);
        return;
      }
      setCsvIndex(0);
      setcurrentrow(csvIds[0]);
      fd.append("mode", "remove-specific");
      fd.append("tags", JSON.stringify(selectedTags));
      fd.append("row", JSON.stringify(csvIds[0]));
      fd.append("flag", JSON.stringify(specificField === "Id"));
      fd.append("resource", JSON.stringify(objectType));
    }

    fetcher.submit(fd, { method: "POST" });

    setModalState({ isOpen: false });
  };

  useEffect(() => {
    // SUCCESS
    if ((globalResult?.complete && globalResult?.success) || specificEnd) {
      setFetchedItems([]);
      setSelectedTags([]);
      setspecificEnd(false);
      setConditions([{ tag: "", operator: "OR" }]);
    }
  }, [globalResult.complete, globalResult.success, specificEnd]);

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
    if (removalMode === "global") {
      setSpecificField("Id");
    }
  }, [objectType, removalMode]);

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

  // Determine if the Fetch button should be enabled based on input length
  const validTagsEntered = conditions.filter((c) => c.tag.trim().length >= 2);
  const tooShortTags = conditions.filter(
    (c) => c.tag.trim().length > 0 && c.tag.trim().length < 2,
  );
  const readyToFetch = validTagsEntered.length > 0 && tooShortTags.length === 0;

  return (
    // Assuming AppProvider is defined
    <AppProvider embedded apiKey={apiKey}>
      <div className="max-w-4xl mx-auto p-6 font-sans text-gray-900 border rounded-2xl mt-20">
        <Navbar />

        {/* Header */}
        <div className="mb-5 border-b border-gray-200 pb-4 flex justify-between items-center">
          <div className="text-left">
            <h1 className="text-2xl font-bold mb-4">Tag Manager</h1>
          </div>
        </div>

        <div
          className={`text-gray-900 ${isRemoving ? "opacity-50 pointer-events-none" : ""
            }`}
        >
          {/* OBJECT TYPE */}
          <div className="mt-4 flex gap-2">
            <select
              value={objectType}
              onChange={handleObjectTypeChange}
              disabled={isActionDisabled || fetchedItems.length > 0} // Disable after fetch until cleared
              className="border border-gray-300 px-3 py-2 rounded-md text-gray-900 disabled:opacity-50"
            >
              <option value="product">Product</option>
              <option value="customer">Customer</option>
              <option value="order">Order</option>
              <option value="article">BlogPost</option>
            </select>

            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value)}
              disabled={isActionDisabled || fetchedItems.length > 0} // Disable after fetch until cleared
              className="border border-gray-300 px-3 py-2 rounded-md text-gray-900 disabled:opacity-50"
            >
              <option value="contain">Contains</option>
              <option value="start">Starts With</option>
              <option value="end">Ends With</option>
              <option value="exact">Exact</option>
            </select>
          </div>


          {/* PRODUCT INDEXING ALERT */}
          {objectType === "product" && (
            <div className="mt-2 p-2 text-orange-700 text-sm">
              <strong>Note:</strong> For products only.
              <br />
              1. After adding a tag, it may take 2–5 minutes to appear here.
              <br />
              2. After removing a tag, it may take 2–5 minutes to disappear here.
            </div>
          )}

          {/* CONDITIONS */}
          <div className="mt-4 space-y-3">
            {conditions.map((c, i) => {
              const isDuplicate =
                c.tag.trim().length > 0 &&
                conditions.some(
                  (other, otherIdx) =>
                    otherIdx !== i &&
                    other.tag.trim().toLowerCase() ===
                    c.tag.trim().toLowerCase(),
                );

              return (
                <div key={i} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <input
                      disabled={isActionDisabled || fetchedItems.length > 0} // Disable after fetch until cleared
                      className={`border px-3 py-2 rounded-md text-gray-900 disabled:opacity-50 ${isDuplicate ? "border-red-500 focus:ring-red-500" : "border-gray-300"
                        }`}
                      // UPDATED PLACEHOLDER
                      placeholder="Enter tag (Min 2 chars)"
                      value={c.tag}
                      onChange={(e) =>
                        updateCondition(i, "tag", e.target.value)
                      }
                    />

                    {conditions.length > 1 && (
                      <button
                        disabled={isActionDisabled || fetchedItems.length > 0} // Disable after fetch until cleared
                        className="text-red-600 font-bold hover:text-red-700 disabled:opacity-50"
                        onClick={() => removeCondition(i)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                  {isDuplicate && (
                    <p className="text-xs text-red-600">Tag already present</p>
                  )}
                </div>
              );
            })}

            <button
              disabled={isActionDisabled || fetchedItems.length > 0} // Disable after fetch until cleared
              className="bg-black text-white px-3 py-1 rounded-md hover:bg-gray-800 transition disabled:opacity-50"
              onClick={addCondition}
            >
              + Add Tag
            </button>
          </div>

          {/* Validation Hint */}

          {/* FETCH / CANCEL BUTTONS */}
          <div className="flex gap-4 items-center">
            <button
              disabled={
                isActionDisabled || fetchedItems.length > 0 || !readyToFetch
              } // Disable if not readyToFetch
              className="mt-4 bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 transition disabled:opacity-50"
              onClick={startFetchTags}
            >
              {isFetching ? "Fetching..." : "Fetch Items"}
            </button>

            {/* NEW: Cancel Button */}
            {(fetchedItems.length > 0 || noTagsFound) && !isRemoving && (
              <button
                className="mt-4 border border-black text-black px-4 py-2 rounded-md hover:bg-gray-100 transition"
                onClick={handleCancel}
              >
                Cancel / Clear
              </button>
            )}
          </div>

          {/* NEW: No Tags Found Feedback */}
          {noTagsFound && !isFetching && (
            <div className="mt-6 border border-blue-500 p-4 bg-blue-100 text-blue-800 rounded-md">
              <p className="font-semibold">
                Couldn't find any items with tags matching your criteria in the
                store. Please adjust your conditions.
              </p>
            </div>
          )}

          {/* RESULTS */}
          {fetchedItems.length > 0 && (
            <div className="mt-6 border border-gray-300 p-4 rounded-md bg-gray-50">
              <h2 className="font-bold">
                Select tags to remove: ({fetchedItems.length} tag
                {fetchedItems.length !== 1 ? "s" : ""} found)
              </h2>

              <div className="flex flex-wrap gap-2 mt-3">
                {[...new Set(fetchedItems)].map((tag) => (
                  <button
                    key={tag}
                    onClick={() =>
                      setSelectedTags((prev) =>
                        prev.includes(tag)
                          ? prev.filter((t) => t !== tag)
                          : [...prev, tag],
                      )
                    }
                    disabled={isActionDisabled} // Disable selection during removal
                    className={`px-3 py-1 border rounded-md transition disabled:opacity-50 ${selectedTags.includes(tag)
                      ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                      : " text-black border-gray-300 hover:bg-gray-100"
                      }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* REMOVAL MODE */}
          {selectedTags.length > 0 && (
            <div className="mt-6 border border-gray-300 p-4 bg-gray-50 rounded-md">
              <p className="font-bold">Removal Mode:</p>

              <label className={isActionDisabled ? "opacity-50" : ""}>
                <input
                  type="radio"
                  checked={removalMode === "global"}
                  onChange={() => setRemovalMode("global")}
                  disabled={isActionDisabled}
                  className="text-black focus:ring-black"
                />{" "}
                Global
              </label>

              <label className={`ml-4 ${isActionDisabled ? "opacity-50" : ""}`}>
                <input
                  type="radio"
                  checked={removalMode === "specific"}
                  onChange={() => setRemovalMode("specific")}
                  disabled={isActionDisabled}
                  className="text-black focus:ring-black"
                />{" "}
                Specific (CSV)
              </label>

              {removalMode === "specific" && (
                <div className="mt-2 ml-6">
                  {/* Inner option: ID or SKU */}
                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-6">
                      {/* IDs Option */}
                      <label
                        className={`flex items-center gap-1 ${isActionDisabled ? "opacity-50" : ""}`}
                      >
                        <input
                          type="radio"
                          name="specificField"
                          value="Id"
                          checked={specificField === "Id"}
                          onChange={() => setSpecificField("Id")}
                          disabled={isActionDisabled}
                        />
                        IDs
                      </label>

                      {/* SKU Option */}
                      <label
                        className={`flex items-center gap-1 ${isActionDisabled ? "opacity-50" : ""}`}
                      >
                        <input
                          type="radio"
                          name="specificField"
                          value={csvType}
                          checked={specificField === csvType}
                          onChange={() => setSpecificField(csvType)}
                          disabled={isActionDisabled}
                        />
                        {csvType}
                      </label>

                      {/* Download CSV Format Button */}
                      <button
                        type="button"
                        onClick={handleDownloadTemplate}
                        disabled={isActionDisabled}
                        className="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-md text-sm border"
                      >
                        Download CSV Format
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mt-2 mb-1">
                    (Max 5000 records allowed)
                  </p>
                  {/* CSV Upload */}
                  <div className="mt-2">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={handleCsvUpload}
                      disabled={isActionDisabled}
                      className="border border-gray-300 p-1 rounded-md disabled:opacity-50"
                    />

                    {csvIds.length > 0 && (
                      <p className="mt-1 text-sm text-gray-600">
                        {csvIds.length}{" "}
                        {specificField === "id" ? "IDs" : `${specificField}'s`}{" "}
                        loaded
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* LOADER */}
          {isRemoving && (
            <div className="mt-6 border border-yellow-800 p-4 bg-yellow-100 text-yellow-800 rounded-md">
              <p className="font-semibold text-lg">
                Removing tags… please wait
              </p>
            </div>
          )}

          {/* GLOBAL RESULT MESSAGE */}
          {!isRemoving && globalResult?.complete && (
            <div
              className={`mt-6 p-4 rounded-md text-center border ${globalResult.success
                ? "bg-green-100 text-green-800 border-green-800"
                : "bg-red-100 text-red-800 border-red-800"
                }`}
            >
              {globalResult.success ? (
                <p className="font-bold">
                  Successfully removed tags from {globalResult.totalProcessed}{" "}
                  items!
                </p>
              ) : (
                <p className="font-bold">
                  Some items failed to update. Check console for details.
                </p>
              )}
            </div>
          )}

          {/* SPECIFIC RESULTS */}
          {(finalSpecificResults?.length > 0 ||
            globalResult?.results.length > 0) &&
            !isRemoving && (
              <div className="mt-6 border border-gray-300 p-4 text-center rounded-md">
                <h2 className="font-bold text-lg mb-3">
                  CSV Processing Complete
                </h2>

                <button
                  onClick={downloadResultCSV}
                  className="bg-black text-white px-4 py-2 rounded-md shadow hover:bg-gray-700 border border-black transition"
                >
                  Download Results CSV
                </button>
              </div>
            )}

          {/* LIVE SPECIFIC RESULTS */}
          {finalSpecificResults.length > 0 && (
            <div className="mt-6">
              <h3 className="text-md font-semibold mb-2">Live Results</h3>
              <div className="max-h-64 overflow-y-auto border p-3 rounded-md bg-white">
                <ul className="text-sm space-y-1">
                  {[...finalSpecificResults].reverse().map((r, idx) => (
                    <li
                      key={idx}
                      className={`${r.success ? "text-green-700" : "text-red-700"}`}
                    >
                      <span className="font-bold mr-2">#{finalSpecificResults.length - idx}</span>
                      ID: {r.row} |{" "}
                      {r.success
                        ? "Success"
                        : `Error: ${r.error || "Unknown error"}`}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* REMOVE BUTTON */}
          {selectedTags.length > 0 && !isRemoving && (
            <button
              className="mt-6 bg-red-600 text-white px-4 py-2 rounded-md border border-red-600 hover:bg-red-700 transition"
              onClick={openRemoveModal}
            >
              Remove Selected Tags
            </button>
          )}

          {/* MODAL (Assuming ConfirmationModal is defined) */}
          <ConfirmationModal
            modalState={{
              ...modalState,
              title: "Confirm Removal",
              message: `Remove ${selectedTags.length} tag(s)?`,
            }}
            onConfirm={handleConfirmRemoval}
            setModalState={setModalState}
            confirmText="Yes, Remove"
            cancelText="Cancel"
          />
        </div>
      </div>
    </AppProvider>
  );
}

