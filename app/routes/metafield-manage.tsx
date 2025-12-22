import { useState, useEffect } from "react";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import ConfirmationModal from "../componant/confirmationmodal";
import AlertModal from "app/componant/alert-modal";
import {
  fetchDefinitions,
  queryMap,
  removeAllMetafields,
  removeSpecificMetafield,
  updateSpecificMetafield,
} from "app/functions/metafield-manage-action";
import {
  MetafieldFetcherUI,
  MetafieldListUI,
  MetafieldRemoverUI,
  CompletionResultsUI,
} from "app/componant/metafield-manage-form";
import Navbar from "app/componant/app-nav";
import type { LoaderFunctionArgs } from "react-router";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import Papa from "papaparse";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);
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
    const resource = queryMap[objectType];
    // REMOVE ALL METAFIELDS (PAGINATED)
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

    // REMOVE SPECIFIC METAFIELD (ONE ID)
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

    // UPDATE SPECIFIC METAFIELD (ONE ID)
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

    // DEFAULT ACTION — FETCH DEFINITIONS
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
  const [alertState, setAlertState] = useState({ isOpen: false, title: "", message: "" });
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
      if (isDeleting && !completed) {
        e.preventDefault();
        e.returnValue = ""; // Chrome requires returnValue to be set
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDeleting]);

  // --- Core Utility Functions ---
  function downloadResultsCSV(results, removeMode) {
    if (!results || results.length === 0) {
      setAlertState({
        isOpen: true,
        title: "No Results",
        message: "No results to download!",
      });
      return;
    }

    let headers = [];
    let rows = [];
    let filename = "";

    // REMOVE ALL
    if (removeMode === "all") {
      headers = ["id", "success", "value", "error"];

      rows = results.map((r) => [
        csvSafe(r.id),
        csvSafe(r.success ? "true" : "false"),
        csvSafe(r.data?.value),
        csvSafe(r.errors),
      ]);

      filename = "removeAll_results";
    }

    // REMOVE SPECIFIC
    else if (removeMode === "specific") {
      headers = [specificField.toLowerCase(), "success", "value", "error"];

      rows = results.map((r) => [
        csvSafe(r.id),
        csvSafe(r.success ? "true" : "false"),
        csvSafe(r.data?.value),
        csvSafe(r.errors),
      ]);

      filename = "remove_results";
    }

    // UPDATE
    else if (removeMode === "update") {
      headers = [
        specificField.toLowerCase(),
        "key",
        "value",
        "success",
        "error",
      ];

      rows = results.map((r) => [
        csvSafe(r.id),
        csvSafe(r.key),
        csvSafe(r.value),
        csvSafe(r.success ? "true" : "false"),
        csvSafe(r.error),
      ]);

      filename = "update_results";
    }

    // BUILD CSV
    const csvArray = [
      headers.map(csvSafe).join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvArray], {
      type: "text/csv;charset=utf-8;",
    });

    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);

    const pad = (n) => n.toString().padStart(2, "0");
    const d = new Date();
    const timeOnly = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;

    link.href = url;
    link.download = `${filename}-${timeOnly}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }

  function csvSafe(value) {
    if (value === null || value === undefined) return "";

    const str = String(value);

    // Escape double quotes
    const escaped = str.replace(/"/g, '""');

    // Wrap in quotes ONLY if needed
    if (/[",\n]/.test(escaped)) {
      return `"${escaped}"`;
    }

    return escaped;
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

    // 1. Basic validation
    if (!file) {
      setCsvRows([]);
      setCsvData(0);
      return;
    }

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setAlertState({
        isOpen: true,
        title: "Invalid File Type",
        message: "Please upload a valid CSV file.",
      });
      e.target.value = null;
      setCsvRows([]);
      setCsvData(0);
      return;
    }

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,

      complete: (res) => {
        const normalizedField = specificField.toLowerCase();

        const rows = res.data
          .map((row) => {
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
          setAlertState({
            isOpen: true,
            title: "Limit Exceeded",
            message: "You can only upload a maximum of 5000 records at a time.",
          });
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
        setAlertState({
          isOpen: true,
          title: "Parsing Error",
          message: "Failed to parse CSV file.",
        });
        setCsvRows([]);
        setCsvData(0);
      },
    });
  };

  function normalizeMetafieldValue(typeInput, rawValue) {
    if (rawValue == null) return null;

    const type =
      typeof typeInput === "string" ? typeInput : typeInput?.name;

    const value = rawValue;

    if (type?.startsWith("list.") && type.includes("_reference")) {
      const list = value.trim().startsWith("[")
        ? JSON.parse(value)
        : value.split(",").map(v => v.trim()).filter(Boolean);

      return JSON.stringify(list);
    }

    if (type?.includes("_reference")) {
      if (!value.trim().startsWith("gid://")) {
        throw new Error("Invalid GID reference");
      }
      return value.trim();
    }

    switch (type) {
      case "single_line_text_field":
        return value;

      case "multi_line_text_field":
        return value.replace(/\\n/g, "\n");

      case "list.single_line_text_field":
        return JSON.stringify(
          value.trim().startsWith("[")
            ? JSON.parse(value)
            : value.split(",").map(v => v.trim()).filter(Boolean)
        );

      case "number_integer":
        if (!Number.isInteger(Number(value))) {
          throw new Error("Invalid integer");
        }
        return String(value);

      case "boolean":
        if (value === "true" || value === true) return "true";
        if (value === "false" || value === false) return "false";
        throw new Error("Invalid boolean");

      case "date_time":
        return value.includes("T") ? value : `${value}T00:00:00Z`;

      case "json":
        return typeof value === "string" ? value : JSON.stringify(value);

      case "link": {
        const v = value.trim();
        if (v.startsWith("{")) return v;
        if (/^https?:\/\//i.test(v)) {
          return JSON.stringify({ text: "View", url: v });
        }
        if (v.includes("|")) {
          const [t, gid] = v.split("|");
          if (gid?.startsWith("gid://")) {
            return JSON.stringify({ type: t.trim(), id: gid.trim() });
          }
        }
        throw new Error("Invalid link value");
      }

      case "url":
        if (!/^https?:\/\//i.test(value.trim())) {
          throw new Error("Invalid URL");
        }
        return value.trim();

      default:
        return value;
    }
  }

  const handleupdateCSVUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!(file.type === "text/csv" || file.name.endsWith(".csv"))) {
      setAlertState({
        isOpen: true,
        title: "Invalid File Type",
        message: "Please upload a valid CSV file!",
      });
      e.target.value = null;
      return;
    }

    const text = await file.text();

    // ONE parser only
    const parsed = parseCSV(text);
    if (!parsed.length) {
      setAlertState({
        isOpen: true,
        title: "Empty CSV",
        message: "CSV is empty",
      });
      return;
    }
    console.log(parsed, '.................line')
    // headers
    const headers = parsed[0].map(h => h.trim().toLowerCase());
    const dataRows = parsed.slice(1);

    if (
      !headers.includes(specificField.toLowerCase()) ||
      !headers.includes("value")
    ) {
      setAlertState({
        isOpen: true,
        title: "Missing Columns",
        message: `CSV must contain '${specificField}' and 'value' columns.`,
      });
      return;
    }

    const idIndex = headers.indexOf(specificField.toLowerCase());
    const valueIndex = headers.indexOf("value");

    const rows = dataRows
      .map(cols => {
        const id = cols[idIndex];
        const value = cols[valueIndex];

        if (!id || value === undefined) return null;

        let normalizedValue;
        let error = "";

        try {
          normalizedValue = normalizeMetafieldValue(
            selectedMetafield.type,
            value
          );
        } catch (e) {
          error = e.message;
        }

        return {
          id,
          namespace: selectedMetafield.namespace,
          key: selectedMetafield.key,
          value: normalizedValue,
          type: selectedMetafield.type,
          error,
          raw: cols,
        };
      })
      .filter(Boolean);

    if (rows.length > 5000) {
      setAlertState({
        isOpen: true,
        title: "Limit Exceeded",
        message: "Max 5000 rows allowed",
      });
      return;
    }

    setCsvRows(rows);
    setCsvData(rows.length);
    setResults([]);
    setProgress(0);
    setCurrentIndex(0);
    setAccumulatedResults([]);
  };
  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");

    return lines.map((line) => {
      const cols = [];
      let current = "";
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];

        // escaped quote
        if (char === '"' && next === '"') {
          current += '"';
          i++;
          continue;
        }

        // toggle quote
        if (char === '"') {
          inQuotes = !inQuotes;
          continue;
        }

        // column break
        if (char === "," && !inQuotes) {
          cols.push(current);
          current = "";
          continue;
        }

        current += char;
      }

      cols.push(current);
      return cols;
    });
  }

  const confirmDelete = () => {
    if (!selectedMetafield) {
      return setAlertState({
        isOpen: true,
        title: "Selection Required",
        message: "Select a metafield!",
      });
    }

    // CSV required for BOTH: specific delete AND update
    if (["specific", "update"].includes(removeMode) && !csvRows.length) {
      return setAlertState({
        isOpen: true,
        title: "Missing CSV",
        message: `Upload a CSV file with ${specificField}'s (and values for update)!`,
      });
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
  };
  const backToSelectedFeild = () => {
    setSelectedMetafield(null);
    setCsvRows([]);
    setRemoveMode("all");
    setProgress(0);
    setResults([]);
    setCompleted(false);
    setCurrentIndex(0);
    setAccumulatedResults([]);
    setResourceCount(0);
    setHasSearched(false);
  };

  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    const data = fetcher.data;
    if (data?.success && data?.payload?.metafields) {
      setMetafields(data.payload.metafields);
    }
    setHasSearched(true);


    const isSuccess = data.success ?? false;
    const response = data?.payload;

    const errorMsg =
      data?.payload?.errors?.[0]?.message ||
      data?.payload?.errors ||
      data?.error ||
      "";

    if (removeMode === "specific" && isDeleting) {
      const row = response;
      console.log(response, 'response')
      let updaterow = { ...row, id: csvRows[currentIndex]?.id };

      const newResult = { ...updaterow, success: isSuccess, error: errorMsg };
      const updated = [...accumulatedResults, newResult];

      setAccumulatedResults(updated);
      setResults(updated);
      setProgress(Math.round(((currentIndex + 1) / csvRows.length) * 100));

      if (currentIndex + 1 >= csvRows.length) {
        setIsDeleting(false);
        setCompleted(true);
        setSelectedMetafield(null);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }

    }

    if (removeMode === "update" && isDeleting) {
      const row = csvRows[currentIndex];
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
        setIsDeleting(false);
        setCompleted(true);
        setSelectedMetafield(null);
      } else {
        setCurrentIndex((prev) => prev + 1);
      }

    }

    if (removeMode === "all" && isDeleting) {
      const payload = data.payload;
      const batch = payload?.results ?? [];
      const nextCursor = payload?.nextCursor ?? null;
      const hasMore = payload?.hasMore ?? false;

      const totalCount = payload?.ResourceCount ?? null;
      if (resourceCount === 0) {
        setResourceCount(totalCount);
      }
      const updatedResults = [...accumulatedResults, ...batch];
      setAccumulatedResults(updatedResults);
      setResults(updatedResults);

      if (totalCount && totalCount > 0) {
        const percent = Math.round((updatedResults.length / totalCount) * 100);
        setProgress(percent);
      } else {
        setProgress(10);
      }
      if (hasMore && nextCursor) {
        const formData = new FormData();
        formData.append("mode", "removeMetafield");
        formData.append("objectType", objectType);
        formData.append("namespace", selectedMetafield.namespace);
        formData.append("key", selectedMetafield.key);
        formData.append("cursor", nextCursor);

        fetcher.submit(formData, { method: "post" });
      } else {
        setProgress(100);
        setCompleted(true);
        setIsDeleting(false);
        setSelectedMetafield(null);
      }
    }
  }, [fetcher.state, fetcher.data]);

  useEffect(() => {
    if (!isDeleting) return;

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
    const currentField = specificField;
    const currentType = csvType;
    const currentObjectType = objectType;

    const header = currentField === "Id" ? "Id" : currentType;

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
      sampleValues = ["#1001", "#1002", "#1003", "#1004", "#1005"];
    } else if (header === "Handle") {
      sampleValues = [
        "sample-handle-1",
        "sample-handle-2",
        "sample-handle-3",
        "sample-handle-4",
        "sample-handle-5",
      ];
    } else if (header === "External_ID") {
      sampleValues = [
        "External_ID-1",
        "External_ID-2",
        "External_ID-3",
        "External_ID-4",
        "External_ID-005",
      ];
    }

    if (removeMode === "specific") {
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
    }

    if (removeMode === "update") {
      const rightColumnSamples = [
        "value-1",
        "value-2",
        "value-3",
        "value-4",
        "value-5",
      ];

      const rows = [
        `${header},Value`,
        ...sampleValues.map((val, i) => `${val},${rightColumnSamples[i]}`),
      ];

      const csvContent = rows.join("\n");

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
            namespace: r.namespace,
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
      <div className="min-h-screen bg-[#f1f2f4] p-6 font-sans">
        <div className="max-w-4xl mx-auto">
          <Navbar />
          <div className="flex items-center gap-4 mb-8 mt-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Metafield Viewer</h1>
              <p className="text-gray-600 text-sm">
                Manage and remove metafields from your store resources.
              </p>
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
              backToSelectedFeild={backToSelectedFeild}
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

          <AlertModal
            modalState={alertState}
            setModalState={setAlertState}
          />
        </div>
      </div>
    </AppProvider>
  );
}
