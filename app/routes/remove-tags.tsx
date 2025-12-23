import { useState, useEffect } from "react";
import { useFetcher, useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import Navbar from "app/componant/app-nav";
import ConfirmationModal from "app/componant/confirmationmodal";
import AlertModal from "app/componant/alert-modal";
import type { LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import {
  handleFetch,
  handleRemoveFromAll,
  handleRemoveSpecific,
} from "app/functions/remove-tag-action";
import Papa from "papaparse";
import {
  Search,
  Trash2,
  Download,
  AlertCircle,
  Plus,
  X,
  Filter,
  Tag,
  FileText,
  CheckCircle,
  XCircle
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
  const navigate = useNavigate();
  const { apiKey } = useLoaderData<typeof loader>();

  const [objectType, setObjectType] = useState("product");
  const [matchType, setMatchType] = useState("contain");

  const [conditions, setConditions] = useState([{ tag: "", operator: "OR" }]);
  const [fetchedItems, setFetchedItems] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);

  const [removalMode, setRemovalMode] = useState("global");
  const [csvIds, setCsvIds] = useState([]);
  const [modalState, setModalState] = useState({ isOpen: false });
  const [alertState, setAlertState] = useState({ isOpen: false, title: "", message: "" });
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
  const [search, setsearch] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);

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
    setsearch(true)
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
    if (search && allFetchedTags.length === 0) { setNoTagsFound(true) }
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
        operation: "Tags-removed",
        objectType,
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
  const addCondition = () => {
    const lastCondition = conditions[conditions.length - 1];
    if (lastCondition && lastCondition.tag.trim() === "") return;
    setConditions((prev) => [...prev, { tag: "", operator: "OR" }]);
  };

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
    setRemovalMode("global");
    setspecificEnd(false);
    setsearch(false)
    setFileName(null);
  };

  useEffect(() => {
    setCsvIds([]);
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
    setFileName(null);
  }, [specificField, objectType, removalMode]);

  const handleClearCSV = () => {
    setCsvIds([]);
    setFileName(null);
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  /* ---------------- CSV UPLOAD ---------------- */
  const handleCsvUpload = (e) => {
    const file = e.target.files?.[0];

    if (!file) {
      setCsvIds([]);
      setFileName(null);
      return;
    }

    setFileName(file.name);

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setAlertState({
        isOpen: true,
        title: "Invalid File Type",
        message: "Please upload a valid CSV file.",
      });
      e.target.value = null;
      setCsvIds([]);
      return;
    }

    const normalizedField = specificField.toLowerCase();
    let hasInvalidGid = false;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.toLowerCase().trim(),

      complete: (res) => {
        if (!Array.isArray(res.data)) {
          setAlertState({
            isOpen: true,
            title: "Invalid CSV",
            message: "Invalid CSV format.",
          });
          setCsvIds([]);
          return;
        }

        const values = res.data
          .map((row) => {
            const rawValue = row[normalizedField];
            const id = typeof rawValue === "string" ? rawValue.trim() : null;

            if (!id) return null;

            // 🔍 Shopify GID validation
            const gidObjectType = getShopifyObjectTypeFromGid(id);

            if (
              gidObjectType &&
              gidObjectType !== objectType.toLowerCase()
            ) {
              setAlertState({
                isOpen: true,
                title: "Invalid Shopify ID",
                message: `The CSV contains an ID of type "${gidObjectType}", but "${objectType}" was selected.\n\nID:\n${id}`,
              });

              hasInvalidGid = true;
              return null;
            }

            return id;
          })
          .filter(Boolean);
        console.log(values, '..........values')
        // ⛔ Stop further execution if validation failed
        if (hasInvalidGid) {
          setCsvIds([]);
          e.target.value = null;
          return;
        }

        if (values.length > 5000) {
          setAlertState({
            isOpen: true,
            title: "Limit Exceeded",
            message: "You can only upload a maximum of 5000 records at a time.",
          });
          setCsvIds([]);
          e.target.value = null;
          return;
        }

        if (values.length === 0) {
          setAlertState({
            isOpen: true,
            title: "Valid format",
            message: "Please upload a valid CSV file.",
          });
          setCsvIds([]);
          e.target.value = null;
          return;
        }

        setCsvIds(values);
      },

      error: (err) => {
        console.error("CSV parsing failed:", err);
        setAlertState({
          isOpen: true,
          title: "Parsing Error",
          message: "Failed to parse CSV file.",
        });
        setCsvIds([]);
        e.target.value = null;
      },
    });
  };


  function getShopifyObjectTypeFromGid(gid) {
    if (typeof gid !== "string") return null;

    const match = gid.match(/^gid:\/\/shopify\/([^/]+)\/\d+$/);
    return match ? match[1].toLowerCase() : null;
  }
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
    setFileName(null);
  };

  /* ---------------- MODAL ---------------- */
  const openRemoveModal = () => {
    if (!csvIds.length && removalMode !== "global") {
      return setAlertState({
        isOpen: true,
        title: "Missing CSV",
        message: `Upload a CSV file with ${specificField}'s`,
      });
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
        setAlertState({
          isOpen: true,
          title: "Missing CSV",
          message: "Upload CSV first.",
        });
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
    if ((globalResult?.complete && globalResult?.success) || specificEnd) {
      setFetchedItems([]);
      setSelectedTags([]);
      setConditions([{ tag: "", operator: "OR" }]);
      setFileName(null);
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
    const currentField = specificField;
    const currentType = csvType;
    const currentObjectType = objectType;

    const header = currentField === "Id" ? "Id" : currentType;
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

    const pad = (n) => n.toString().padStart(2, "0");
    const d = new Date();
    const timeOnly = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

    link.download = `sample-${header}-template-${timeOnly}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const validTagsEntered = conditions.filter((c) => c.tag.trim().length >= 2);
  const tooShortTags = conditions.filter(
    (c) => c.tag.trim().length > 0 && c.tag.trim().length < 2,
  );
  const readyToFetch = validTagsEntered.length > 0 && tooShortTags.length === 0;

  return (
    <AppProvider embedded apiKey={apiKey}>
      <div className="min-h-screen bg-[#f1f2f4] p-8 font-sans relative">
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
        <div className="max-w-6xl mx-auto">
          <Navbar />

          {/* Header */}
          <div className="flex items-center gap-4 mb-8 mt-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Remove Tags</h1>
              <p className="text-gray-600 text-sm">
                Search for tags and remove them globally or from specific items.
              </p>
            </div>
          </div>

          <div className={`grid grid-cols-1 lg:grid-cols-3 gap-6 ${isRemoving ? "opacity-50 pointer-events-none" : ""}`}>

            {/* LEFT COLUMN: Configuration */}
            <div className="lg:col-span-1 space-y-6">

              {/* Card 1: Settings */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Filter size={18} /> Configuration
                </h2>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Object Type</label>
                    <select
                      value={objectType}
                      onChange={handleObjectTypeChange}
                      disabled={isActionDisabled || fetchedItems.length > 0}
                      className="w-full border cursor-pointer border-gray-300 px-3 py-2 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-800 focus:border-gray-800 outline-none transition-all disabled:bg-gray-100"
                    >
                      <option value="product">Product</option>
                      <option value="customer">Customer</option>
                      <option value="order">Order</option>
                      <option value="article">BlogPost</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Match Type</label>
                    <select
                      value={matchType}
                      onChange={(e) => setMatchType(e.target.value)}
                      disabled={isActionDisabled || fetchedItems.length > 0}
                      className="w-full border cursor-pointer border-gray-300 px-3 py-2 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-800 focus:border-gray-800 outline-none transition-all disabled:bg-gray-100"
                    >
                      <option value="contain">Contains</option>
                      <option value="start">Starts With</option>
                      <option value="end">Ends With</option>
                      <option value="exact">Exact</option>
                    </select>
                  </div>

                  {objectType === "product" && (
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs flex gap-2 items-start">
                      <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold mb-1">Note for Products:</p>
                        <p>Updates may take 2-5 minutes to reflect due to Shopify indexing.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: Conditions */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Search size={18} /> Search Conditions
                </h2>

                <div className="space-y-3">
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
                      <div key={i} className="relative">
                        <input
                          disabled={isActionDisabled || fetchedItems.length > 0}
                          className={`w-full border px-3 py-2 rounded-lg text-gray-900 focus:ring-2 focus:ring-gray-800 outline-none transition-all disabled:bg-gray-100 ${isDuplicate
                            ? "border-red-500 focus:ring-red-500"
                            : "border-gray-300 focus:border-gray-800"
                            }`}
                          placeholder="Enter tag (Min 2 chars)"
                          value={c.tag}
                          onChange={(e) =>
                            updateCondition(i, "tag", e.target.value)
                          }
                        />
                        {conditions.length > 1 && (
                          <button
                            disabled={isActionDisabled || fetchedItems.length > 0}
                            className="absolute right-2 top-2.5 text-gray-400 hover:text-red-600 transition-colors"
                            onClick={() => removeCondition(i)}
                          >
                            <X size={16} />
                          </button>
                        )}
                        {isDuplicate && (
                          <p className="text-xs text-red-600 mt-1">Tag already present</p>
                        )}
                      </div>
                    );
                  })}

                  <button
                    disabled={isActionDisabled || fetchedItems.length > 0 || (conditions.length > 0 && conditions[conditions.length - 1].tag.trim() === "")}
                    className="w-full py-2 border cursor-pointer border-dashed border-gray-300 rounded-lg text-gray-500 hover:text-gray-800 hover:border-gray-400 hover:bg-gray-50 transition-all flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={addCondition}
                  >
                    <Plus size={16} /> Add Another Tag
                  </button>

                  <div className="pt-4 flex gap-3">
                    <button
                      disabled={isActionDisabled || fetchedItems.length > 0 || !readyToFetch}
                      className="flex-1 bg-gray-800 text-white cursor-pointer px-4 py-2 rounded-lg hover:bg-gray-900 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium shadow-sm"
                      onClick={startFetchTags}
                    >
                      {isFetching ? "Fetching..." : "Fetch Tags"}
                    </button>

                    {fetchedItems.length > 0 && (
                      <button
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium shadow-sm"
                        onClick={handleCancel}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN: Results & Actions */}
            <div className="lg:col-span-2 space-y-6">

              {/* 1. LOADING STATE: Shown while searching/fetching tags from the store */}
              {isFetching && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center flex flex-col items-center justify-center h-full min-h-[400px]">
                  <div className="relative mb-6">
                    <div className="w-12 h-12 border-4 border-gray-100 border-t-black rounded-full animate-spin"></div>
                    <Search size={20} className="absolute inset-0 m-auto text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">Scanning Store Tags</h3>
                  <p className="text-gray-500 max-w-xs mx-auto mb-4">
                    Searching through your {objectType}s to find matching tags.
                  </p>
                  <div className="flex gap-1 justify-center">
                    <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                    <span className="w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                    <span className="w-2 h-2 bg-black rounded-full animate-bounce"></span>
                  </div>
                </div>
              )}

              {/* 2. PLACEHOLDER STATE: Only visible when the app is completely idle and empty */}
              {!isFetching &&
                !noTagsFound &&
                fetchedItems.length === 0 &&
                !isRemoving &&
                !globalResult.complete &&
                !specificEnd && (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center flex flex-col items-center justify-center h-full min-h-[400px]">
                    <div className="bg-gray-50 p-4 rounded-full mb-4">
                      <Search size={48} className="text-gray-300" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">Ready to Search</h3>
                    <p className="text-gray-500 max-w-sm mx-auto">
                      Select an object type on the left, enter the tags you want to find, and click "Fetch Tags" to get started.
                    </p>
                  </div>
                )}

              {/* 3. NO TAGS FOUND: Friendly error state */}
              {noTagsFound && !isFetching && fetchedItems.length === 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-8 text-center text-blue-800">
                  <div className="inline-flex p-3 bg-blue-100 rounded-full mb-3">
                    <Search size={24} className="text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-lg">No tags found</h3>
                  <p className="text-blue-600 mt-1">Try adjusting your search conditions or Match Type.</p>
                  <button
                    onClick={handleCancel}
                    className="mt-4 text-sm font-bold underline hover:text-blue-900"
                  >
                    Reset Search
                  </button>
                </div>
              )}

              {/* 4. TAG SELECTION AREA: Show fetched tags after successful scan */}
              {!isFetching && fetchedItems.length > 0 && !isRemoving && !globalResult.complete && !specificEnd && (
                <div className="space-y-6">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Tag size={18} /> Select Tags to Remove
                      <span className="text-sm font-normal text-gray-500 ml-auto bg-gray-100 px-2 py-1 rounded-md">
                        {fetchedItems.length} found
                      </span>
                    </h2>

                    <div className="flex flex-wrap gap-2 max-h-60 overflow-y-auto p-1">
                      {[...new Set(fetchedItems)].map((tag) => (
                        <button
                          key={tag}
                          onClick={() =>
                            setSelectedTags((prev) =>
                              prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                            )
                          }
                          disabled={isActionDisabled}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border cursor-pointer ${selectedTags.includes(tag)
                            ? "bg-red-50 text-red-700 border-red-200 ring-1 ring-red-200"
                            : "bg-white text-gray-700 border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                            }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 5. REMOVAL OPTIONS: Only visible after user selects at least one tag */}
                  {selectedTags.length > 0 && (
                    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 animate-in fade-in slide-in-from-top-4">
                      <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <Trash2 size={18} /> Removal Method
                      </h2>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                        <label className={`relative flex items-start p-4 cursor-pointer rounded-lg border transition-all ${removalMode === "global" ? "border-black bg-gray-50 ring-1 ring-black" : "border-gray-200 hover:border-gray-300"}`}>
                          <input
                            type="radio"
                            className="mt-1 mr-3 accent-black"
                            checked={removalMode === "global"}
                            onChange={() => setRemovalMode("global")}
                            disabled={isActionDisabled}
                          />
                          <div>
                            <span className="block font-medium text-gray-900 cursor-pointer">Global Removal</span>
                            <span className="block text-xs text-gray-500 mt-1">Remove tags from ALL items store-wide.</span>
                          </div>
                        </label>

                        <label className={`relative flex items-start p-4 cursor-pointer rounded-lg border transition-all ${removalMode === "specific" ? "border-black bg-gray-50 ring-1 ring-black" : "border-gray-200 hover:border-gray-300"}`}>
                          <input
                            type="radio"
                            className="mt-1 mr-3 accent-black"
                            checked={removalMode === "specific"}
                            onChange={() => setRemovalMode("specific")}
                            disabled={isActionDisabled}
                          />
                          <div>
                            <span className="block font-medium text-gray-900">Specific Removal</span>
                            <span className="block text-xs text-gray-500 mt-1">Only remove tags from a specific CSV list.</span>
                          </div>
                        </label>
                      </div>

                      {removalMode === "specific" && (
                        <div className="bg-gray-50 rounded-lg p-5 border border-gray-200 mb-6">
                          {csvIds.length === 0 ? (
                            <>
                              <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-4">
                                <span className="text-sm font-medium text-gray-700">Match by:</span>
                                <div className="flex gap-4">
                                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                    <input type="radio" checked={specificField === "Id"} onChange={() => setSpecificField("Id")} className="accent-black" /> IDs
                                  </label>
                                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                                    <input type="radio" checked={specificField === csvType} onChange={() => setSpecificField(csvType)} className="accent-black" /> {csvType}
                                  </label>
                                </div>
                                <button type="button" onClick={handleDownloadTemplate} className="ml-auto cursor-pointer text-xs text-gray-600 underline flex items-center gap-1 hover:text-black">
                                  <Download size={12} /> Template
                                </button>
                              </div>
                              <input
                                type="file" accept=".csv" onChange={handleCsvUpload} disabled={isActionDisabled}
                                className="block w-full text-xs text-blue-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-black file:text-white cursor-pointer"
                              />
                            </>
                          ) : (
                            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-100 rounded-md text-[#008060] text-sm font-bold">
                              <CheckCircle size={16} />
                              <span className="truncate max-w-[200px]">{fileName}</span>
                              <span className="text-gray-400">|</span>
                              <span>{csvIds.length} Records Loaded Successfully</span>
                              <button
                                onClick={handleClearCSV}
                                className="ml-auto text-red-600 hover:text-red-800 text-xs font-bold uppercase tracking-wider border border-red-200 px-2 py-1 rounded bg-white hover:bg-red-50 transition-colors"
                              >
                                Remove
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        disabled={removalMode === "specific" && csvIds.length === 0}
                        className="w-full bg-red-600 cursor-pointer text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors font-medium shadow-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-400"
                        onClick={openRemoveModal}
                      >
                        <Trash2 size={18} /> Remove Selected Tags
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 6. REMOVING PROGRESS: Active operation state */}
              {isRemoving && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center flex flex-col items-center justify-center">
                  <div className="relative mb-4">
                    <div className="w-12 h-12 border-4 border-gray-100 border-t-black rounded-full animate-spin"></div>
                  </div>
                  <p className="font-semibold text-lg text-gray-900">Removing...</p>

                  {removalMode === "global" && (
                    <p className="text-sm text-gray-500 mt-2 font-medium">
                      {globalResult.totalProcessed} items processed so far...
                    </p>
                  )}

                  {removalMode === "specific" && (
                    <p className="text-sm text-gray-500 mt-2 font-medium">
                      {finalSpecificResults.length} / {csvIds.length} items processed...
                    </p>
                  )}

                  <p className="text-xs text-gray-400 mt-4">Please keep this window open while we update your store.</p>
                </div>
              )}

              {/* 7. COMPLETION STATE: Summary and Export */}
              {(globalResult.complete || specificEnd) && !isRemoving && (
                <div className="space-y-6 animate-in zoom-in-95 duration-300">
                  <div className={`rounded-xl p-10 text-center border ${globalResult.success ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"}`}>
                    <CheckCircle size={48} className={`mx-auto mb-4 ${globalResult.success ? "text-green-600" : "text-red-600"}`} />
                    <h2 className="text-2xl font-bold text-gray-900 mb-2">Operation Complete</h2>
                    <p className="text-gray-600 mb-8">
                      {removalMode === "global"
                        ? `Successfully removed tags from ${globalResult.totalProcessed} items.`
                        : `Processed ${finalSpecificResults.length} items from CSV.`}
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3 justify-center">
                      <button onClick={downloadResultCSV} className="bg-black text-white px-8 py-3 rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg">
                        <FileText size={20} /> Download Results CSV
                      </button>
                      <button onClick={handleCancel} className="bg-white text-gray-900 border border-gray-300 px-8 py-3 rounded-lg font-bold hover:bg-gray-50">
                        Start New Task
                      </button>
                    </div>
                  </div>

                </div>
              )}

              {/* 8. LIVE ACTIVITY LOG: Visible during and after specific removal */}
              {finalSpecificResults.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4">
                  <div className="px-6 py-4 border-b bg-gray-50 font-bold text-sm uppercase tracking-wider text-gray-500 flex justify-between items-center">
                    <span>Activity Log</span>
                    <span className="text-xs font-normal normal-case bg-gray-200 px-2 py-1 rounded-full text-gray-700">
                      {finalSpecificResults.length} processed
                    </span>
                  </div>
                  <div className="max-h-80 overflow-y-auto p-4 space-y-2">
                    {[...finalSpecificResults].reverse().map((r, idx) => (
                      <div key={idx} className={`text-xs p-3 rounded-md flex flex-col gap-1 border ${r.success ? "bg-white border-gray-100" : "bg-red-50 border-red-100"}`}>
                        <div className="flex justify-between items-center w-full">
                          <span className="font-mono font-medium">{r.row}</span>
                          <span className={r.success ? "text-green-700 font-bold" : "text-red-700 font-bold"}>
                            {r.success ? "SUCCESS" : "FAILED"}
                          </span>
                        </div>
                        {!r.success && r.error && (
                          <div className="text-red-600 mt-1 pl-2 border-l-2 border-red-200">
                            {r.error}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <ConfirmationModal
            modalState={{
              ...modalState,
              title: "Confirm Removal",
              message: `Are you sure you want to remove ${selectedTags.length} tag(s)? This action cannot be undone immediately.`,
            }}
            onConfirm={handleConfirmRemoval}
            setModalState={setModalState}
            confirmText="Yes, Remove Tags"
            cancelText="Cancel"
          />

          <AlertModal
            modalState={alertState}
            setModalState={setAlertState}
          />
        </div>
      </div>
    </AppProvider>
  );
}
