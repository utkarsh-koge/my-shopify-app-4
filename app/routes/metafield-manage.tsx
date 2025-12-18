import { useState, useEffect } from "react";
import { useFetcher, useNavigate, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import ConfirmationModal from "../componant/confirmationmodal";
import {
  fetchDefinitions,
  queryMap,
  removeAllMetafields,
  removeSpecificMetafield,
  updateSpecificMetafield,
} from "app/functions/metafield-clear-action";
import {
  MetafieldFetcherUI,
  MetafieldListUI,
  MetafieldRemoverUI,
  CompletionResultsUI,
} from "app/componant/metafield-clear-form";
import Navbar from "app/componant/app-nav";
import type { LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
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

// ----------------action---------------
export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();

    const objectType = formData.get("objectType");
    const mode = formData.get("mode");
    const namespace = formData.get("namespace");
    const key = formData.get("key");
    const value = formData.get("value");
    const type = formData.get("type");
    const id = formData.get("id");
    const flag = formData.get("flag");
    console.log(flag, "...........flag");
    const resource = queryMap[objectType];
    console.log(resource, "...........resource");
    // -----------------------------------------------------
    // REMOVE ALL METAFIELDS (PAGINATED)
    // -----------------------------------------------------
    if (mode === "removeMetafield") {
      const cursor = formData.get("cursor") || null;

      const payload = await removeAllMetafields(
        admin,
        resource,
        namespace,
        key,
        cursor,
      );

      return { success: true, payload };
    }

    // -----------------------------------------------------
    // REMOVE SPECIFIC METAFIELD (ONE ID)
    // -----------------------------------------------------
    if (mode === "removeMetafieldSpecific") {
      if (!id) {
        return { success: false, message: "No ID provided" };
      }

      const payload = await removeSpecificMetafield(
        admin,
        id,
        namespace,
        key,
        flag,
        objectType,
      );

      return { success: payload.success, payload };
    }

    // -----------------------------------------------------
    // UPDATE SPECIFIC METAFIELD (ONE ID)
    // -----------------------------------------------------
    if (mode === "updateMetafieldSpecific") {
      if (!id) {
        return { success: false, message: "No ID provided" };
      }

      const payload = await updateSpecificMetafield(
        admin,
        id,
        namespace,
        key,
        value,
        type,
        flag,
        objectType,
      );

      return { success: payload.success, payload };
    }

    // -----------------------------------------------------
    // DEFAULT ACTION — FETCH DEFINITIONS
    // -----------------------------------------------------
    const payload = await fetchDefinitions(admin, resource);
    return { success: true, payload };
  } catch (err) {
    return {
      success: false,
      message: "Internal server error",
      error: err.message || "Unexpected failure",
    };
  }
}

export default function SingleMetafieldViewer() {
  const fetcher = useFetcher();
  const { apiKey } = useLoaderData<typeof loader>();

  const [objectType, setObjectType] = useState("product");
  const [metafields, setMetafields] = useState([]);
  const [selectedMetafield, setSelectedMetafield] = useState(null);
  const [removeMode, setRemoveMode] = useState("all");
  const [csvRows, setCsvRows] = useState([]);
  const [modalState, setModalState] = useState({ isOpen: false });
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [accumulatedResults, setAccumulatedResults] = useState([]);
  const loading = fetcher.state === "submitting";
  const [csvType, setcsvType] = useState("Id"); // default selected
  const [specificField, setSpecificField] = useState("Id"); // default selected
  const [resourceCount, setResourceCount] = useState(0);
  const [csvData, setCsvData] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  // Prevent reload/close while running
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDeleting) {
        e.preventDefault();
        e.returnValue = ""; // Chrome requires returnValue to be set
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDeleting]);
  console.log(csvData, "........resourceCount");
  // --- Core Utility Functions ---
  function downloadResultsCSV(results, removeMode) {
    if (!results || results.length === 0) {
      alert("No results to download!");
      return;
    }

    let headers = [];
    let rows = [];
    let filename = "";

    if (removeMode === "all") {
      headers = ["id", "success", "value", "error"];

      rows = results.map((r) => [
        r.id || "",
        r.success ? "true" : "false",
        r.data?.value,
        r.errors || "",
      ]);

      filename = "removeAll_results";
    }

    // -------------------------------
    // DELETE (specific)
    // -------------------------------
    if (removeMode === "specific") {
      headers = [specificField.toLowerCase(), "success", "value", "error"];

      rows = results.map((r) => [
        r.id || "",
        r.success ? "true" : "false",
        r.data?.value,
        r.errors || "",
      ]);

      filename = "remove_results";
    }

    // -------------------------------
    // UPDATE
    // -------------------------------
    else if (removeMode === "update") {
      headers = [
        specificField.toLowerCase(),
        "key",
        "value",
        "success",
        "error",
      ];

      rows = results.map((r) => [
        r.id || "",
        r.key || "",
        r.value || "",
        r.success ? "true" : "false",
        r.error || "",
      ]);

      filename = "update_results";
    }

    // -------------------------------
    // Build CSV
    // -------------------------------
    const csvArray = [headers, ...rows]
      .map((row) => row.map((value) => `"${value}"`).join(","))
      .join("\n");

    const blob = new Blob([csvArray], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    // Get time only (HH-MM-SS)
    const pad = (n) => n.toString().padStart(2, "0");
    const d = new Date();
    const timeOnly = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

    // Use time-only as suffix
    filename = `${filename}-${timeOnly}.csv`;

    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  // --- Handler Functions ---

  const fetchMetafields = () => {
    if (!objectType) return;
    const formData = new FormData();
    formData.append("objectType", objectType);
    fetcher.submit(formData, { method: "post" });
    setCsvData(0);
    setHasSearched(false);
  };

  const handleMetafieldSelection = (m) => {
    setSelectedMetafield(m);
    // Reset state for next operation
    setCsvRows([]);
    setRemoveMode("all");
    setProgress(0);
    setResults([]);
    setCompleted(false);
    setCurrentIndex(0);
    setAccumulatedResults([]);
  };

  const handleCSVUpload = (e) => {
    const file = e.target.files?.[0];

    // -----------------------------
    // 1. Basic validation
    // -----------------------------
    if (!file) {
      setCsvRows([]);
      setCsvData(0);
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please upload a valid CSV file.");
      e.target.value = null;
      setCsvRows([]);
      setCsvData(0);
      return;
    }

    // -----------------------------
    // 2. Parse CSV (PRODUCTION)
    // -----------------------------
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,

      complete: (res) => {
        const normalizedField = specificField.toLowerCase();

        const rows = res.data
          .map((row) => {
            // Convert CSV headers to lowercase
            const normalizedRow = Object.keys(row).reduce((acc, key) => {
              acc[key.toLowerCase()] = row[key];
              return acc;
            }, {});

            return {
              id: normalizedRow[normalizedField]?.trim(),
              namespace: selectedMetafield.namespace,
              key: selectedMetafield.key,
            };
          })
          .filter((r) => r.id);

        console.log(rows, ".........rows");

        if (rows.length > 5000) {
          alert("You can only upload a maximum of 5000 records at a time.");
          setCsvRows([]);
          setCsvData(0);
          e.target.value = null;
          return;
        }

        setCsvData(rows.length);
        setCsvRows(rows);
        setResults([]);
        setProgress(0);
        setCurrentIndex(0);
        setAccumulatedResults([]);
      },

      error: (err) => {
        console.error("CSV parsing failed:", err);
        alert("Failed to parse CSV file.");
        setCsvRows([]);
        setCsvData(0);
      },
    });
  };

  const handleupdateCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) {
      setCsvRows([]);
      setCsvData(0);
      return;
    }

    if (!(file.type === "text/csv" || file.name.endsWith(".csv"))) {
      alert("Please upload a valid CSV file!");
      e.target.value = null;
      return setCsvRows([]);
    }

    const text = await file.text();

    // --- 1️⃣ READ LINES SAFELY ---
    const lines = text.split(/\r?\n/).filter(Boolean);

    // --- 2️⃣ READ HEADER ---
    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
    lines.shift(); // remove header row

    // Validate required header: id + value
    if (
      !headers.includes(specificField.toLowerCase()) ||
      !headers.includes("value")
    ) {
      alert(`CSV must contain '${specificField}' and 'value' columns.`);
      return;
    }

    const idIndex = headers.indexOf(specificField.toLowerCase());
    const valueIndex = headers.indexOf("value");

    // --- 3️⃣ SMARTEST CSV PARSER: supports commas inside quotes ---
    const parseCSVLine = (line) => {
      const values = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"' && line[i + 1] !== '"') {
          inQuotes = !inQuotes;
          continue;
        }

        if (char === '"' && line[i + 1] === '"') {
          current += '"'; // escaped quote ("")
          i++;
          continue;
        }

        if (char === "," && !inQuotes) {
          values.push(current.trim());
          current = "";
          continue;
        }

        current += char;
      }

      values.push(current.trim());
      return values;
    };

    // --- 4️⃣ BUILD ROWS ---
    const rows = lines.map((line) => {
      const cols = parseCSVLine(line);

      const idRaw = cols[idIndex];
      const valueRaw = cols[valueIndex];

      return {
        id: idRaw,
        namespace: selectedMetafield.namespace,
        key: selectedMetafield.key,
        value: valueRaw, // ANY TYPE: text, number, json, date, comma
        raw: cols,
        type: selectedMetafield.type, // store all raw columns if needed
      };
    });

    if (!rows.length) {
      alert("CSV file contains no valid rows!");
      return;
    }

    if (rows.length > 5000) {
      alert("You can only upload a maximum of 5000 records at a time.");
      setCsvRows([]);
      e.target.value = null;
      return;
    }
    setCsvData(rows.length);
    setCsvRows(rows);
    setResults([]);
    setProgress(0);
    setCurrentIndex(0);
    setAccumulatedResults([]);
  };

  const confirmDelete = () => {
    if (!selectedMetafield) return alert("Select a metafield!");

    // CSV required for BOTH: specific delete AND update
    if (["specific", "update"].includes(removeMode) && !csvRows.length) {
      return alert(
        `Upload a CSV file with ${specificField}'s (and values for update)!`,
      );
    }

    setModalState({ isOpen: true });
  };

  const handleConfirm = () => {
    setModalState({ isOpen: false });
    setProgress(0);
    setAccumulatedResults([]);
    setResults([]);
    setCurrentIndex(0);
    setResourceCount(0);
    if (removeMode === "all") {
      setIsDeleting(true);

      const formData = new FormData();
      formData.append("mode", "removeMetafield");
      formData.append("objectType", objectType);
      formData.append("namespace", selectedMetafield.namespace);
      formData.append("key", selectedMetafield.key);
      fetcher.submit(formData, { method: "post" });
    } else if (removeMode === "specific") {
      setIsDeleting(true); // Triggers sequential delete loop via useEffect
    } else if (removeMode === "update") {
      setIsDeleting(true); // Triggers sequential delete loop via useEffect
    }
  };

  const resetToHome = () => {
    setSelectedMetafield(null);
    setCsvRows([]);
    setRemoveMode("all");
    setProgress(0);
    setResults([]);
    setCompleted(false);
    setMetafields([]);
    setCurrentIndex(0);
    setAccumulatedResults([]);
    setResourceCount(0);
    setHasSearched(false);
    // navigate(0)
  };

  console.log(results, ".......progress");
  useEffect(() => {
    // Only run when the request finishes
    if (fetcher.state !== "idle" || !fetcher.data) return;

    const data = fetcher.data;
    // --------------------------------------------
    // 1. Handle metafield fetch (initial load)
    // --------------------------------------------
    if (data?.success && data?.payload?.metafields) {
      setMetafields(data.payload.metafields);
    }
    setHasSearched(true);


    // Now we are processing delete/update operations
    const isSuccess = data.success ?? false;
    const response = data?.payload;

    const errorMsg =
      data?.payload?.errors?.[0]?.message ||
      data?.payload?.errors ||
      data?.error ||
      "";

    // ============================================================
    // 2. REMOVE MODE: SPECIFIC (CSV sequential)
    // ============================================================
    if (removeMode === "specific" && isDeleting) {
      const row = response;

      let updaterow = { ...row, id: csvRows[currentIndex]?.id };

      const newResult = { ...updaterow, success: isSuccess, error: errorMsg };
      const updated = [...accumulatedResults, newResult];

      setAccumulatedResults(updated);
      setResults(updated);
      setProgress(Math.round(((currentIndex + 1) / csvRows.length) * 100));

      if (currentIndex + 1 >= csvRows.length) {
        // Finished
        setIsDeleting(false);
        setCompleted(true);
        setSelectedMetafield(null);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }

    }

    // ============================================================
    // 3. UPDATE MODE: (CSV sequential)
    // ============================================================
    if (removeMode === "update" && isDeleting) {
      const row = csvRows[currentIndex];
      // setcurrentrow(row);
      let updaterow = { ...row, id: csvRows[currentIndex]?.id };
      console.log(updaterow, "........updaterow", currentIndex);
      const newResult = {
        ...row,
        success: isSuccess,
        error: errorMsg,
        updatedValue: row.value,
      };
      console.log(row, "........newResult");

      if (currentIndex + 1 < csvRows.length) {
        const updated = [...accumulatedResults, newResult];
        setAccumulatedResults(updated);
        setResults(updated);
      }

      setProgress(Math.round(((currentIndex + 1) / csvRows.length) * 100));

      if (currentIndex + 1 >= csvRows.length) {
        // Finished
        setIsDeleting(false);
        setCompleted(true);
        setSelectedMetafield(null);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }

    }

    // ============================================================
    // 4. REMOVE ALL MODE (PAGINATED DELETE + REAL PROGRESS BAR)
    // ============================================================
    if (removeMode === "all" && isDeleting) {
      const payload = data.payload;
      const batch = payload?.results ?? [];
      const nextCursor = payload?.nextCursor ?? null;
      const hasMore = payload?.hasMore ?? false;

      // 🔥 NEW: TOTAL COUNT provided by the server
      const totalCount = payload?.ResourceCount ?? null;
      if (resourceCount === 0) {
        setResourceCount(totalCount);
      }

      // 1️⃣ Append batch results to accumulated results
      const updatedResults = [...accumulatedResults, ...batch];
      setAccumulatedResults(updatedResults);
      setResults(updatedResults);
      console.log(payload, "........batch");

      // 2️⃣ REAL progress bar calculation
      if (totalCount && totalCount > 0) {
        const percent = Math.round((updatedResults.length / totalCount) * 100);
        setProgress(percent);
      } else {
        // fallback progress
        setProgress(10);
      }

      // 3️⃣ If more batches remain → fetch next batch
      if (hasMore && nextCursor) {
        console.log("➡️ Fetching next batch...");
        const formData = new FormData();
        formData.append("mode", "removeMetafield");
        formData.append("objectType", objectType);
        formData.append("namespace", selectedMetafield.namespace);
        formData.append("key", selectedMetafield.key);
        formData.append("cursor", nextCursor);

        fetcher.submit(formData, { method: "post" });
      }

      // 4️⃣ If no more pages → finish delete process
      console.log("✅ ALL BATCHES DELETED");
      setProgress(100);
      setCompleted(true);
      setIsDeleting(false);
      setSelectedMetafield(null);
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (!isDeleting) return;

    // remove-all does NOT use sequential loop
    if (removeMode === "all") return;

    if (currentIndex >= csvRows.length) {
      setIsDeleting(false);
      setCompleted(true);
      setSelectedMetafield(null);
      return;
    }

    const row = csvRows[currentIndex];
    const formData = new FormData();

    if (removeMode === "specific") {
      formData.append("mode", "removeMetafieldSpecific");
    }

    if (removeMode === "update") {
      formData.append("mode", "updateMetafieldSpecific");
      formData.append("value", row.value);
    }
    formData.append("flag", specificField === "Id");
    formData.append("namespace", row.namespace);
    formData.append("key", row.key);
    formData.append("id", row.id);
    formData.append("type", row.type?.name);
    formData.append("objectType", objectType);

    fetcher.submit(formData, { method: "post" });
  }, [currentIndex, isDeleting, removeMode]);

  useEffect(() => {
    if (
      progress === 100 &&
      !isDeleting &&
      (removeMode === "all" || removeMode === "specific")
    ) {
      const TrueResult = results.filter((r) => r?.success);
      console.log("we arehereeeeeeeeeeeee", TrueResult);
      const Data = {
        operation: "Metafield-removed",
        objectType,
        value: TrueResult,
      };
      if (TrueResult.length > 0) {
        fetcher.submit(JSON.stringify(Data), {
          method: "POST",
          action: "/api/add/db",
          encType: "application/json",
        });
      }
    }
  }, [results]);

  useEffect(() => {
    if (objectType === "product") {
      setcsvType("Handle");
    }
    if (objectType === "customer") {
      setcsvType("Email");
    }
    if (objectType === "order") {
      setcsvType("Name");
    }
    if (objectType === "blogPost") {
      setcsvType("Handle");
    }
    if (objectType === "variant") {
      setcsvType("Sku");
    }
    if (objectType === "company") {
      setcsvType("External_ID");
    }
    if (objectType === "companyLocation") {
      setcsvType("External_ID");
    }
    if (objectType === "location") {
      setcsvType("Name");
    }
    if (objectType === "page") {
      setcsvType("Handle");
    }
    if (objectType === "blog") {
      setcsvType("Handle");
    }

    if (removeMode === "specific") {
      setSpecificField("Id");
    } else if (removeMode === "all") {
      setSpecificField("Id");
    } else if (removeMode === "update") {
      setSpecificField("Id");
    }
    setHasSearched(false);
  }, [objectType, removeMode]);

  const handleDownloadTemplate = () => {
    // Freeze values at the moment of click
    const currentField = specificField;
    const currentType = csvType;
    const currentObjectType = objectType;

    // Determine CSV header
    const header = currentField === "Id" ? "Id" : currentType;

    // Map object types to Shopify GID resource names
    const gidMap = {
      product: "Product",
      customer: "Customer",
      order: "Order",
      blogPost: "Article",
      blog: "Blog",
      page: "Page",
      variant: "ProductVariant",
      company: "Company",
      companyLocation: "CompanyLocation",
      location: "Location",
    };

    const gidType = gidMap[currentObjectType] || "Unknown";

    // Build sample values based on header
    let sampleValues = [];

    if (header === "Id") {
      sampleValues = [
        `gid://shopify/${gidType}/123456789`,
        `gid://shopify/${gidType}/987654321`,
        `gid://shopify/${gidType}/111111111`,
        `gid://shopify/${gidType}/222222222`,
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
      // ORDER NAME
      sampleValues = ["#1001", "#1002", "#1003", "#1004", "#1005"];
    } else if (header === "Handle") {
      // For product, blog, blogPost, page
      sampleValues = [
        "sample-handle-1",
        "sample-handle-2",
        "sample-handle-3",
        "sample-handle-4",
        "sample-handle-5",
      ];
    } else if (header === "External_ID") {
      // For company and companyLocation
      sampleValues = [
        "External_ID-1",
        "External_ID-2",
        "External_ID-3",
        "External_ID-4",
        "External_ID-005",
      ];
    }

    if (removeMode === "specific") {
      // Build CSV content
      const csvContent = [header, ...sampleValues].join("\n");

      // Create Blob
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      // Create download link
      const link = document.createElement("a");
      link.href = url;

      // Time-only suffix (HH-MM-SS)
      const pad = (n) => n.toString().padStart(2, "0");
      const d = new Date();
      const timeOnly = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

      link.download = `sample-${header}-template-${timeOnly}.csv`;

      // Trigger download
      link.click();
      URL.revokeObjectURL(url);
    }

    if (removeMode === "update") {
      // Build right-column sample values (value-1 → value-5)
      const rightColumnSamples = [
        "value-1",
        "value-2",
        "value-3",
        "value-4",
        "value-5",
      ];

      // Combine into CSV rows
      const rows = [
        `${header},Value`, // headers
        ...sampleValues.map((val, i) => `${val},${rightColumnSamples[i]}`),
      ];

      const csvContent = rows.join("\n");

      // Create Blob
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);

      // Create download link
      const link = document.createElement("a");
      link.href = url;

      // Time-only suffix (HH-MM-SS)
      const pad = (n) => n.toString().padStart(2, "0");
      const d = new Date();
      const timeOnly = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

      link.download = `sample-${header}-template-${timeOnly}.csv`;

      link.click();
      URL.revokeObjectURL(url);
    }
  };

  useEffect(() => {
    setCsvData(0);
    console.log("CSV TYPE CHANGED");
    const fileInput = document.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  }, [specificField, objectType, removeMode]);

  useEffect(() => {
    if (progress === 100 && !isDeleting) {
      const TrueResult = results.filter((r) => r?.success);
      console.log("we arehereeeeeeeeeeeee", TrueResult);

      let operation = "Metafield-removed";
      let formattedResults = TrueResult;

      if (removeMode === "update") {
        operation = "Metafield-updated";
        formattedResults = TrueResult.map((r) => ({
          ...r,
          data: {
            key: r.key,
            type: r.type,
            value: r.value,
          },
        }));
      }

      const Data = {
        operation,
        objectType,
        value: formattedResults,
      };

      if (TrueResult.length > 0) {
        fetcher.submit(JSON.stringify(Data), {
          method: "POST",
          action: "/api/add/db",
          encType: "application/json",
        });
      }
    }
  }, [results, isDeleting, progress]);
  return (
    <AppProvider embedded apiKey={apiKey}>
      <div className="max-w-4xl mx-auto p-6 font-sans text-gray-900 border rounded-2xl mt-20">
        <Navbar />
        <div className="mb-8 border-b border-gray-200 pb-4 flex justify-between items-center">
          {/* Left Side: Title and Description */}
          <div className="text-left">
            <h1 className="text-2xl font-bold mb-4">Metafield Viewer</h1>
          </div>
        </div>
        {!selectedMetafield && !completed && (
          <>
            <MetafieldFetcherUI
              objectType={objectType}
              setObjectType={setObjectType}
              queryMap={queryMap}
              fetchMetafields={fetchMetafields}
              metafields={metafields}
              resetToHome={resetToHome}
              loading={loading}
              isDeleting={isDeleting}
              hasSearched={hasSearched}
            />
            <MetafieldListUI
              metafields={metafields}
              handleMetafieldSelection={handleMetafieldSelection}
              isDeleting={isDeleting}
            />
          </>
        )}

        {selectedMetafield && !completed && (
          <MetafieldRemoverUI
            selectedMetafield={selectedMetafield}
            removeMode={removeMode}
            setRemoveMode={setRemoveMode}
            handleCSVUpload={handleCSVUpload}
            handleupdateCSVUpload={handleupdateCSVUpload}
            confirmDelete={confirmDelete}
            isDeleting={isDeleting}
            loading={loading}
            progress={progress}
            resetToHome={resetToHome}
            setSpecificField={setSpecificField}
            specificField={specificField}
            csvType={csvType}
            handleDownloadTemplate={handleDownloadTemplate}
            csvData={csvData}
            results={results}
          />
        )}

        {completed && (
          <CompletionResultsUI
            results={results}
            downloadResultsCSV={downloadResultsCSV}
            resetToHome={resetToHome}
            removeMode={removeMode}
          />
        )}
        <ConfirmationModal
          modalState={{
            isOpen: modalState.isOpen,
            title: "Confirm Metafield Deletion",
            message:
              removeMode === "all"
                ? "This metafield will be deleted from ALL items. This action cannot be undone."
                : `This metafield will be deleted only for the selected ${specificField}'s in the CSV.`,
          }}
          confirmText="Delete"
          cancelText="Cancel"
          onConfirm={handleConfirm}
          setModalState={setModalState}
          isRemoving={loading || isDeleting}
        />
      </div>
    </AppProvider>
  );
}
