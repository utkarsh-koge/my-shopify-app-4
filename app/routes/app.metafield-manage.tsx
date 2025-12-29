import { useState, useEffect, useCallback } from "react";
import { useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  LegacyCard,
  Select,
  Button,
  Spinner,
  Text,
  EmptyState,
  RadioButton,
  BlockStack,
  Box,
  Badge,
  Banner,
  ProgressBar,
  DropZone,
  IndexTable,
  Modal,
  ChoiceList,
  InlineStack,
  Icon,
  Tooltip,
  ResourceList,
  ResourceItem,
  Avatar
} from "@shopify/polaris";
import {
  SearchIcon,
  DeleteIcon,
  FilterIcon,
  AlertCircleIcon,
  DatabaseIcon,
  FileIcon,
  CheckCircleIcon,
  RefreshIcon,
  ArrowLeftIcon,
  NoteIcon,
  ImportIcon
} from "@shopify/polaris-icons";
import {
  fetchDefinitions,
  queryMap,
  removeAllMetafields,
  removeSpecificMetafield,
  updateSpecificMetafield,
} from "app/functions/metafield-manage-action";
import type { LoaderFunctionArgs } from "react-router";
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
    const resource = queryMap[objectType];
    console.log(value, 'formdata');
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

      const flag1 = formData.get("flag1");

      const payload = await removeSpecificMetafield(
        admin,
        id,
        namespace,
        key,
        value,
        type,
        flag,
        flag1,
        objectType,
      );
      return { success: payload.success, payload };
    }

    // UPDATE SPECIFIC METAFIELD (ONE ID)
    if (mode === "updateMetafieldSpecific") {
      if (!id) {
        return { success: false, message: "No ID provided" };
      }

      const flag2 = formData.get("flag2");

      const payload = await updateSpecificMetafield(
        admin,
        id,
        namespace,
        key,
        value,
        type,
        flag,
        flag2,
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
  const [objectType, setObjectType] = useState("product");
  const [metafields, setMetafields] = useState([]);
  const [selectedMetafield, setSelectedMetafield] = useState(null);
  const [removeMode, setRemoveMode] = useState("all");
  const [listUpdateMode, setListUpdateMode] = useState("merge");
  const [listRemoveMode, setListRemoveMode] = useState("full");
  const [csvRows, setCsvRows] = useState([]);

  // Modals & Alerts
  const [modalOpen, setModalOpen] = useState(false);
  const [alert, setAlert] = useState<{ active: boolean; title: string; message: string; tone?: 'critical' | 'success' }>({
    active: false,
    title: "",
    message: "",
  });

  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [accumulatedResults, setAccumulatedResults] = useState([]);
  const [csvType, setcsvType] = useState("Id"); // default selected
  const [specificField, setSpecificField] = useState("Id"); // default selected
  const [resourceCount, setResourceCount] = useState(0);
  const [csvData, setCsvData] = useState(0);
  const [hasSearched, setHasSearched] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [manualLoading, setManualLoading] = useState(false);
  const loading = fetcher.state === "submitting" || manualLoading;

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDeleting && !completed) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [isDeleting]);

  useEffect(() => {
    setSpecificField("Id")
  }, [listRemoveMode, listUpdateMode]);

  // --- Core Utility Functions ---
  function downloadResultsCSV(results, removeMode) {
    if (!results || results.length === 0) {
      setAlert({
        active: true,
        title: "No Results",
        message: "No results to download!",
        tone: 'critical'
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

    // REMOVE SPECIFIC Without partial
    else if (removeMode === "specific" && listRemoveMode !== 'partial') {
      headers = [specificField.toLowerCase(), "success", "value", "error"];
      rows = results.map((r) => [
        csvSafe(r.id),
        csvSafe(r.success ? "true" : "false"),
        csvSafe(r.data?.value),
        csvSafe(r.errors),
      ]);
      filename = "remove_results";
    }

    // REMOVE SPECIFIC With partial
    else if ((removeMode === "specific" && listRemoveMode === 'partial')) {
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
    const escaped = str.replace(/"/g, '""');
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
    setManualLoading(true);
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
    setFileName(null);
  };

  // Replaces handleCSVUpload and handleupdateCSVUpload to work with DropZone
  const handleDropZoneDrop = useCallback(async (_dropFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) {
      setCsvRows([]);
      setCsvData(0);
      return;
    }
    setFileName(file.name);

    const isUpdateOrPartial = removeMode === "update" || (removeMode === "specific" && listRemoveMode === "partial");

    if (isUpdateOrPartial) {
      // Handle Update/Partial CSV
      const text = await file.text();
      const parsed = parseCSV(text);

      if (!parsed.length) {
        setAlert({ active: true, title: "Empty CSV", message: "CSV is empty", tone: 'critical' });
        setCsvRows([]); setCsvData(0); return;
      }

      const headers = parsed[0].map(h => h.trim().toLowerCase());
      const dataRows = parsed.slice(1);

      if (!headers.includes(specificField.toLowerCase()) || !headers.includes("value")) {
        setAlert({ active: true, title: "Missing Columns", message: `CSV must contain '${specificField}' and 'value' columns.`, tone: 'critical' });
        setCsvRows([]); setCsvData(0); return;
      }

      const idIndex = headers.indexOf(specificField.toLowerCase());
      const valueIndex = headers.indexOf("value");
      let hasInvalidGid = false;

      const rows = dataRows.map((cols) => {
        const rawId = cols[idIndex];
        const id = typeof rawId === "string" ? rawId.trim() : rawId;
        const value = cols[valueIndex];
        if (!id || value === undefined) return null;

        const gidObjectType = getShopifyObjectTypeFromGid(id);
        let type = objectType.toLowerCase() === 'blogpost' ? 'article' : objectType.toLowerCase();

        if (gidObjectType && gidObjectType !== type) {
          setAlert({
            active: true,
            title: "Invalid Shopify ID",
            message: `The CSV contains an ID of type "${gidObjectType}", but "${objectType}" was selected.\n\nID: ${id}`,
            tone: 'critical'
          });
          hasInvalidGid = true;
          return null;
        }

        let normalizedValue;
        let error = "";
        try {
          normalizedValue = normalizeMetafieldValue(selectedMetafield.type, value);
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
      }).filter(Boolean);

      if (hasInvalidGid) { setCsvRows([]); setCsvData(0); return; }
      if (rows.length > 5000) {
        setAlert({ active: true, title: "Limit Exceeded", message: "Only 5000 records will add at a time", tone: 'critical' });
        setCsvRows([]); setCsvData(0); return;
      }
      if (rows.length === 0) {
        setAlert({ active: true, title: "Valid Record Not Found", message: "No valid records found in the CSV file.", tone: 'critical' });
        setCsvRows([]); setCsvData(0); return;
      }
      setCsvRows(rows);
      console.log(rows, '.......rows');
      setCsvData(rows.length);
      setResults([]);
      setProgress(0);
      setCurrentIndex(0);
      setAccumulatedResults([]);
      setAlert({ ...alert, active: false })

    } else {
      // Handle Standard Removal CSV
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (res) => {
          const normalizedField = specificField.toLowerCase();
          let hasInvalidGid = false;

          const rows = res.data.map((row) => {
            const normalizedRow = Object.keys(row).reduce((acc, key) => {
              acc[key.toLowerCase()] = row[key];
              return acc;
            }, {});

            const rawId = normalizedRow[normalizedField];
            const id = typeof rawId === "string" ? rawId.trim() : rawId;
            if (!id) return null;

            let gidObjectType = getShopifyObjectTypeFromGid(id);
            let type = objectType.toLowerCase() === 'blogpost' ? 'article' : objectType.toLowerCase();

            if (gidObjectType && gidObjectType !== type) {
              setAlert({
                active: true,
                title: "Invalid Shopify ID",
                message: `The CSV contains an ID of type "${gidObjectType}", but "${objectType}" was selected.\n\nID: ${id}`,
                tone: 'critical'
              });
              hasInvalidGid = true;
              return null;
            }
            return {
              id,
              namespace: selectedMetafield?.namespace,
              key: selectedMetafield?.key,
            };
          }).filter(Boolean);

          if (hasInvalidGid) { setCsvRows([]); setCsvData(0); return; }
          if (rows.length > 5000) {
            setAlert({ active: true, title: "Limit Exceeded", message: "Only 5000 records will add at a time", tone: 'critical' });
            setCsvRows([]); setCsvData(0); return;
          }
          if (rows.length === 0) {
            setAlert({ active: true, title: "Valid Record Not Found", message: "No valid records found.", tone: 'critical' });
            setCsvRows([]); setCsvData(0); return;
          }

          setCsvData(rows.length);
          setCsvRows(rows);
          setResults([]);
          setProgress(0);
          setCurrentIndex(0);
          setAccumulatedResults([]);
          setAlert({ ...alert, active: false })
        },
        error: (err) => {
          setAlert({ active: true, title: "Parsing Error", message: "Failed to parse CSV file.", tone: 'critical' });
          setCsvRows([]); setCsvData(0);
        }
      });
    }
  }, [removeMode, listRemoveMode, specificField, objectType, selectedMetafield]);

  function getShopifyObjectTypeFromGid(gid) {
    if (typeof gid !== "string") return null;
    const match = gid.match(/^gid:\/\/shopify\/([^/]+)\/\d+$/);
    return match ? match[1].toLowerCase() : null;
  }

  function normalizeMetafieldValue(typeInput, rawValue) {
    if (rawValue == null) return null;
    const type = typeof typeInput === "string" ? typeInput : typeInput?.name;
    const value = rawValue;

    if (type?.startsWith("list.") && type.includes("_reference")) {
      const list = value.trim().startsWith("[")
        ? JSON.parse(value)
        : value.split(",").map(v => v.trim()).filter(Boolean);
      return JSON.stringify(list);
    }

    if (type?.includes("_reference") && !type?.includes("metaobject_reference")) {
      if (!value.trim().startsWith("gid://")) {
        throw new Error("Invalid GID reference");
      }
      return value.trim();
    }

    switch (type) {
      case "single_line_text_field": return value;
      case "multi_line_text_field": return value.replace(/\\n/g, "\n");
      case "list.single_line_text_field":
        return JSON.stringify(
          value.trim().startsWith("[") ? JSON.parse(value) : value.split(",").map(v => v.trim()).filter(Boolean)
        );
      case "number_integer":
        if (!Number.isInteger(Number(value))) throw new Error("Invalid integer");
        return String(value);
      case "boolean":
        if (value === "true" || value === true) return "true";
        if (value === "false" || value === false) return "false";
        throw new Error("Invalid boolean");
      case "date_time": return value.includes("T") ? value : `${value}T00:00:00Z`;
      case "json": return typeof value === "string" ? value : JSON.stringify(value);
      case "link": {
        const v = value.trim();
        if (v.startsWith("{")) return v;
        if (/^https?:\/\//i.test(v)) return JSON.stringify({ text: "View", url: v });
        if (v.includes("|")) {
          const [t, gid] = v.split("|");
          if (gid?.startsWith("gid://")) return JSON.stringify({ type: t.trim(), id: gid.trim() });
        }
        throw new Error("Invalid link value");
      }
      case "url":
        if (!/^https?:\/\//i.test(value.trim())) throw new Error("Invalid URL");
        return value.trim();
      default: return value;
    }
  }

  function parseCSV(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
    return lines.map((line) => {
      const cols = [];
      let current = "";
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const next = line[i + 1];
        if (char === '"' && next === '"') { current += '"'; i++; continue; }
        if (char === '"') { inQuotes = !inQuotes; continue; }
        if (char === "," && !inQuotes) { cols.push(current); current = ""; continue; }
        current += char;
      }
      cols.push(current);
      return cols;
    });
  }

  const confirmDelete = () => {
    if (!selectedMetafield) {
      setAlert({ active: true, title: "Selection Required", message: "Select a metafield!", tone: 'critical' });
      return;
    }
    if (["specific", "update"].includes(removeMode) && !csvRows.length) {
      setAlert({ active: true, title: "Missing CSV", message: `Upload a CSV file with ${specificField}'s (and values for update)!`, tone: 'critical' });
      return;
    }
    setModalOpen(true);
  };

  const handleConfirm = () => {
    setModalOpen(false);
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
      setIsDeleting(true);
    } else if (removeMode === "update") {
      setIsDeleting(true);
    }
  };

  const resetToHome = () => {
    setSelectedMetafield(null);
    setCsvRows([]);
    setRemoveMode("all");
    setListUpdateMode("merge");
    setListRemoveMode("full");
    setProgress(0);
    setResults([]);
    setCompleted(false);
    setMetafields([]);
    setCurrentIndex(0);
    setAccumulatedResults([]);
    setResourceCount(0);
    setHasSearched(false);
    setFileName(null);
    setAlert({ ...alert, active: false })
  };

  const backToSelectedFeild = () => {
    setSelectedMetafield(null);
    setCsvRows([]);
    setRemoveMode("all");
    setListUpdateMode("merge");
    setListRemoveMode("full");
    setProgress(0);
    setResults([]);
    setCompleted(false);
    setCurrentIndex(0);
    setAccumulatedResults([]);
    setResourceCount(0);
    setHasSearched(false);
    setFileName(null);
    setAlert({ ...alert, active: false })
  };

  const handleClearCSV = () => {
    setCsvRows([]);
    setCsvData(0);
    setFileName(null);
  };

  // --- Effects for Processing ---
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;

    const data = fetcher.data;
    if (data?.success && data?.payload?.metafields) {
      setMetafields(data.payload.metafields);
    }
    setHasSearched(true);
    setManualLoading(false);

    const isSuccess = data.success ?? false;
    const response = data?.payload;
    const errorMsg = data?.payload?.errors?.[0]?.message || data?.payload?.errors || data?.error || "";

    if (removeMode === "specific" && isDeleting && listRemoveMode !== 'partial') {
      const row = response;
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

    if (removeMode === "specific" && isDeleting && listRemoveMode === 'partial') {
      const row = response;
      const updaterow = {
        ...row,
        id: csvRows[currentIndex]?.id,
        value: Array.isArray(row.data) ? row.data.join(", ") : row.data,
        key: row.key,
        type: row.type,
        namespace: row.namespace
      };
      const newResult = {
        ...updaterow,
        success: isSuccess,
        errors: errorMsg || null,
      };
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
      const newResult = {
        ...row,
        success: isSuccess,
        error: errorMsg,
        updatedValue: row.value,
      };

      if (currentIndex + 1 <= csvRows.length) {
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
      if (resourceCount === 0) setResourceCount(totalCount);

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

    const typeName = typeof selectedMetafield?.type === "string" ? selectedMetafield.type : selectedMetafield?.type?.name;

    if (removeMode === "specific") {
      console.log(row, 'roaaaaaaaaaaw');

      formData.append("mode", "removeMetafieldSpecific");
      if (listRemoveMode === 'partial' && typeName?.startsWith('list.')) {
        formData.append("flag1", "true");
        formData.append("value", row.value);
      } else {
        formData.append("flag1", "false");
      }
    }

    if (removeMode === "update") {
      formData.append("mode", "updateMetafieldSpecific");
      formData.append("value", row.value);
      if (listUpdateMode === 'replace' && typeName?.startsWith('list.')) {
        formData.append("flag2", "true");
      } else {
        formData.append("flag2", "false");
      }
    }
    formData.append("flag", specificField === "Id");
    formData.append("namespace", row.namespace);
    formData.append("key", row.key);
    formData.append("id", row.id);
    formData.append("type", row?.type?.name || typeName);
    formData.append("objectType", objectType);
    fetcher.submit(formData, { method: "post" });
  }, [currentIndex, isDeleting, removeMode]);

  useEffect(() => {
    if (objectType === "product") setcsvType("Handle");
    if (objectType === "collection") setcsvType("Handle");
    if (objectType === "customer") setcsvType("Email");
    if (objectType === "order") setcsvType("Name");
    if (objectType === "blogPost") setcsvType("Handle");
    if (objectType === "productVariant") setcsvType("Sku");
    if (objectType === "market") setcsvType("Name");
    if (objectType === "company") setcsvType("External_ID");
    if (objectType === "companyLocation") setcsvType("External_ID");
    if (objectType === "location") setcsvType("Name");
    if (objectType === "page") setcsvType("Handle");
    if (objectType === "blog") setcsvType("Handle");

    if (["specific", "all", "update"].includes(removeMode)) {
      setSpecificField("Id");
    }
    setListUpdateMode("merge");
    setListRemoveMode("full");
    setHasSearched(false);
  }, [objectType, removeMode]);

  const handleDownloadTemplate = () => {
    const currentField = specificField;
    const currentType = csvType;
    const currentObjectType = objectType;

    const header = currentField === "Id" ? "Id" : currentType;
    const gidMap = {
      product: "Product", customer: "Customer", order: "Order", articles: "Article", blog: "Blog", page: "Page",
      productVariant: "ProductVariant", company: "Company", companyLocation: "CompanyLocation", location: "Location", market: "Market", collection: "Collection",
    };
    const gidType = gidMap[currentObjectType] || "Unknown";
    let sampleValues = [];

    if (header === "Id") {
      sampleValues = [`gid://shopify/${gidType}/123456789`, `gid://shopify/${gidType}/987654321`];
    } else if (header === "Sku") {
      sampleValues = ["SKU-1", "SKU-2"];
    } else if (header === "Email") {
      sampleValues = ["example1@mail.com", "example2@mail.com"];
    } else if (header === "Name") {
      sampleValues = ["#1001", "#1002"];
    } else if (header === "Handle") {
      sampleValues = ["sample-handle-1", "sample-handle-2"];
    } else if (header === "External_ID") {
      sampleValues = ["External_ID-1", "External_ID-2"];
    }

    let csvContent = "";
    if (removeMode === "specific" && listRemoveMode !== 'partial') {
      csvContent = [header, ...sampleValues].join("\n");
    }
    else if ((removeMode === "update" || removeMode === "specific") && selectedMetafield?.type?.name?.startsWith("list.")) {
      const rightColumnSamples = ["value-1,value-2", "value-3,value-4"];
      const rows = [`${header},value`, ...sampleValues.map((val, i) => `${val},"${rightColumnSamples[i]}"`)];
      csvContent = rows.join("\n");
    }
    else if (removeMode === "update" && !selectedMetafield?.type?.name?.startsWith('list.')) {
      const rightColumnSamples = ["value-1", "value-2"];
      const rows = [`${header},Value`, ...sampleValues.map((val, i) => `${val},${rightColumnSamples[i]}`)];
      csvContent = rows.join("\n");
    }

    if (csvContent) {
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sample-${header}-template-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  function toJsonArrayString(value) {
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return JSON.stringify(parsed);
      } catch { }
    }
    if (Array.isArray(value)) return JSON.stringify(value);
    return JSON.stringify(String(value).split(",").map(v => v.trim()).filter(Boolean));
  }

  useEffect(() => {
    setCsvData(0);
    setCsvRows([]);
    setListUpdateMode("merge");
    setListRemoveMode("full");
    setProgress(0);
    setResults([]);
    setCompleted(false);
    setCurrentIndex(0);
    setAccumulatedResults([]);
    setFileName(null);
    setSpecificField("Id");
    setResourceCount(0);
    setAlert(prev => ({ ...prev, active: false }));
  }, [removeMode]);

  // Logging Effects
  useEffect(() => {
    if (progress === 100 && !isDeleting) {
      const TrueResult = results.filter((r) => r?.success);
      let operation = "";
      let formattedResults = TrueResult;

      if (removeMode === "specific" && listRemoveMode === 'partial') {
        operation = "Metafield-removed";
        formattedResults = TrueResult.map((r) => ({
          ...r,
          data: { namespace: r.namespace, key: r.key, type: r.type, value: toJsonArrayString(r.data) },
        }));
      }

      if (removeMode === "update") {
        operation = "Metafield-updated";
        formattedResults = TrueResult.map((r) => ({
          ...r,
          data: { namespace: r.namespace, key: r.key, type: r.type, value: r.value },
        }));
      }

      if ((removeMode === "all" || (removeMode === "specific" && listRemoveMode !== 'partial'))) {
        operation = "Metafield-removed";
        formattedResults = TrueResult.map((r) => {
          if (r.data && typeof r.data === 'object' && !Array.isArray(r.data)) {
            return { ...r, namespace: r.data.namespace || r.namespace, key: r.data.key || r.key, value: r.data.value, type: r.data.type || r.type };
          }
          return r;
        });
      }

      if (TrueResult.length > 0 && operation) {
        const Data = { operation, objectType, value: formattedResults };
        fetch("/api/add/db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Data),
        }).catch(err => console.error("Logging error", err));
      }
    }
  }, [results, isDeleting, progress]);

  useEffect(() => {
    setCsvData(0);
    setCsvRows([]);
    setProgress(0);
    setResults([]);
    setCompleted(false);
    setCurrentIndex(0);
    setAccumulatedResults([]);
    setFileName(null);
    setResourceCount(0);
    setAlert(prev => ({ ...prev, active: false }));
  }, [listRemoveMode, listUpdateMode]);

  return (
    <Page
      title="Metafield Manager"
      subtitle="Manage and remove metafields from your store resources."
    >
      <Layout>
        {/* --- LEFT COLUMN: CONFIGURATION --- */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <LegacyCard sectioned>
              <BlockStack gap="400">
                <Select
                  label="Resource Type"
                  options={Object.entries(queryMap).map(([key]) => ({
                    label: key.charAt(0).toUpperCase() + key.slice(1),
                    value: key
                  }))}
                  value={objectType}
                  onChange={setObjectType}
                  disabled={loading || isDeleting || metafields.length > 0}
                />
                {metafields.length === 0 ? (
                  <Button
                    variant="primary"
                    onClick={fetchMetafields}
                    loading={loading}
                    disabled={isDeleting}
                    fullWidth
                    icon={SearchIcon}
                  >
                    Fetch Metafields
                  </Button>
                ) : (
                  !completed && progress === 0 && !isDeleting && (
                    <Button
                      onClick={resetToHome}
                      fullWidth
                      icon={RefreshIcon}
                    >
                      Reset
                    </Button>
                  )
                )}
              </BlockStack>
            </LegacyCard>
          </BlockStack>
        </Layout.Section>

        {/* --- RIGHT COLUMN: RESULTS & ACTIONS --- */}
        <Layout.Section>
          <BlockStack gap="500">
            {alert.active && (
              <Banner
                title={alert.title}
                tone={alert.tone || 'info'}
                onDismiss={() => setAlert({ ...alert, active: false })}
              >
                <p>{alert.message}</p>
              </Banner>
            )}

            {/* 1. LOADING STATE */}
            {loading && !isDeleting && !completed && (
              <LegacyCard sectioned>
                <BlockStack align="center" inlineAlign="center" gap="400">
                  <Spinner size="large" />
                  <Text as="h3" variant="headingMd">Scanning Store Metafields</Text>
                  <Text as="p" tone="subdued">Searching through your {objectType}s...</Text>
                </BlockStack>
              </LegacyCard>
            )}

            {/* 2. COMPLETION STATE */}
            {completed && (
              <LegacyCard sectioned>
                <BlockStack align="center" inlineAlign="center" gap="500">
                  <Badge tone="success" size="large" icon={CheckCircleIcon}>Operation Complete</Badge>
                  <Text as="p" variant="bodyLg">The metafield operation finished successfully.</Text>

                  <BlockStack gap="200" align="center" inlineAlign="center">
                    <div style={{ width: '100%', minWidth: '300px' }}>
                      <ProgressBar progress={100} tone="success" />
                    </div>
                    <Text as="span" variant="bodyMd" fontWeight="bold">100%</Text>
                  </BlockStack>

                  <InlineStack gap="300">
                    {results.length > 0 && (
                      <Button onClick={() => downloadResultsCSV(results, removeMode)} variant="primary" icon={FileIcon}>
                        Download Results CSV
                      </Button>
                    )}
                    <Button onClick={resetToHome}>Clear</Button>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            )}

            {/* 3. EMPTY STATE / READY TO SEARCH */}
            {!loading && !completed && metafields.length === 0 && !hasSearched && (
              <LegacyCard sectioned>
                <EmptyState
                  heading="Ready to Search"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Select a resource type on the left and click "Fetch Metafields".</p>
                </EmptyState>
              </LegacyCard>
            )}

            {/* 4. NO METAFIELDS FOUND */}
            {!loading && !completed && metafields.length === 0 && hasSearched && (
              <Banner title="No Metafields Found" tone="info">
                <p>Try selecting a different resource type.</p>
              </Banner>
            )}

            {(!loading || isDeleting) && !completed && metafields.length > 0 && !selectedMetafield && (
              <LegacyCard>
                <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
                  <ResourceList
                    resourceName={{ singular: 'metafield', plural: 'metafields' }}
                    items={metafields}
                    renderItem={(item) => {
                      const { namespace, key, type } = item;
                      const media = <Icon source={NoteIcon} tone="base" />;

                      return (
                        <ResourceItem
                          id={`${namespace}-${key}`}
                          url="#"
                          media={media}
                          accessibilityLabel={`Select ${namespace}.${key}`}
                          onClick={() => handleMetafieldSelection(item)}
                        >
                          <BlockStack gap="100">
                            <InlineStack gap="200" align="start">
                              <Text as="h3" variant="headingSm" fontWeight="bold">
                                {key}
                              </Text>
                              <Badge tone="info">{namespace}</Badge>
                            </InlineStack>
                            <Text as="span" tone="subdued" variant="bodySm">
                              Type: {typeof type === 'string' ? type : type?.name || "Standard"}
                            </Text>
                          </BlockStack>
                        </ResourceItem>
                      );
                    }}
                  />
                </div>
              </LegacyCard>
            )}

            {/* 6A. PROCESSING STATE */}
            {isDeleting && (
              <LegacyCard sectioned>
                <BlockStack align="center" inlineAlign="center" gap="500">
                  <Spinner size="large" />
                  <Text as="h3" variant="headingMd">
                    {removeMode === 'update' ? "Updating Metafields" :
                      removeMode === 'specific' ? "Removing Specific Metafields" :
                        "Deleting Metafields Globally"}
                  </Text>
                  <Text as="p" tone="subdued">
                    {removeMode === 'update' ? "Updating/Adding based on CSV..." :
                      removeMode === 'specific' ? "Removing for CSV items..." :
                        "Removing from ALL resources..."}
                  </Text>

                  <BlockStack gap="200" align="center" inlineAlign="center">
                    <div style={{ width: '100%', minWidth: '300px' }}>
                      <ProgressBar progress={progress} tone="highlight" />
                    </div>
                    <Text as="span" variant="bodyMd" fontWeight="bold">{progress}%</Text>
                  </BlockStack>
                </BlockStack>
              </LegacyCard>
            )}

            {/* 6B. CONFIGURE & RUN OPERATION */}
            {!loading && !isDeleting && !completed && selectedMetafield && (
              <LegacyCard sectioned>
                <BlockStack gap="500">
                  <InlineStack align="space-between">
                    <Text as="p" variant="headingSm" tone="subdued">
                      Target: {selectedMetafield.namespace}.{selectedMetafield.key}
                    </Text>
                    <Button variant="plain" onClick={backToSelectedFeild}>Change Selection</Button>
                  </InlineStack>

                  {/* Modes */}
                  <ChoiceList
                    title="Operation Mode"
                    choices={[
                      { label: 'Global Deletion (Remove from ALL items)', value: 'all' },
                      { label: 'Targeted Removal (Remove from CSV list)', value: 'specific' },
                      { label: 'Bulk Update (Update/Add via CSV)', value: 'update' }
                    ]}
                    selected={[removeMode]}
                    onChange={(val) => setRemoveMode(val[0])}
                    disabled={isDeleting}
                  />

                  {/* Sub-configuration for Specific/Update */}
                  {removeMode !== 'all' && (
                    <Box padding="400" background="bg-surface-secondary" borderRadius="200">
                      <BlockStack gap="400">
                        {/* List Handling Options */}
                        {selectedMetafield?.type?.name?.startsWith("list.") && (
                          <BlockStack gap="200">
                            <Text as="h3" variant="headingSm">List Strategy</Text>
                            {removeMode === "specific" ? (
                              <ChoiceList
                                title=""
                                choices={[
                                  { label: 'Delete Metafield Completely', value: 'full' },
                                  { label: 'Remove Specific Values', value: 'partial' }
                                ]}
                                selected={[listRemoveMode]}
                                onChange={(val) => setListRemoveMode(val[0])}
                              />
                            ) : (
                              <ChoiceList
                                title=""
                                choices={[
                                  { label: 'Merge/Append Values', value: 'merge' },
                                  { label: 'Replace Entire List', value: 'replace' }
                                ]}
                                selected={[listUpdateMode]}
                                onChange={(val) => setListUpdateMode(val[0])}
                              />
                            )}
                          </BlockStack>
                        )}

                        {/* CSV Upload Section */}
                        {csvData === 0 ? (
                          <BlockStack gap="300">
                            <BlockStack gap="200">
                              <ChoiceList
                                title="Match by"
                                choices={[
                                  { label: 'Shopify GID', value: 'Id' },
                                  { label: csvType, value: csvType }
                                ]}
                                selected={[specificField]}
                                onChange={(val) => setSpecificField(val[0])}
                              />
                              <Button variant="plain" onClick={handleDownloadTemplate} icon={ImportIcon}>Download Sample CSV</Button>
                            </BlockStack>

                            <DropZone onDrop={handleDropZoneDrop} accept=".csv" allowMultiple={false} disabled={isDeleting}>
                              <DropZone.FileUpload actionTitle="Add CSV File" />
                            </DropZone>
                          </BlockStack>
                        ) : (
                          <Banner tone="success" onDismiss={handleClearCSV}>
                            <InlineStack align="space-between">
                              <Text as="span">{fileName} — {csvData} records loaded.</Text>
                            </InlineStack>
                          </Banner>
                        )}
                      </BlockStack>
                    </Box>
                  )}

                  <Button
                    variant="primary"
                    tone={removeMode === 'update' ? undefined : 'critical'}
                    disabled={isDeleting || loading || (removeMode !== 'all' && !csvRows.length)}
                    onClick={confirmDelete}
                    fullWidth
                    icon={removeMode === 'update' ? RefreshIcon : DeleteIcon}
                  >
                    {removeMode === 'update' ? "Run Update" : "Delete Metafield"}
                  </Button>

                </BlockStack>
              </LegacyCard>
            )}

            {/* 7. LIVE LOGS */}
            {results.length > 0 && removeMode !== "all" && (
              <LegacyCard sectioned>
                <BlockStack gap="400">
                  <InlineStack align="space-between">
                    <Text as="h3" variant="headingSm">Activity Log</Text>
                    <Badge>{results.length} processed</Badge>
                  </InlineStack>
                  <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                    <IndexTable
                      resourceName={{ singular: 'result', plural: 'results' }}
                      itemCount={results.length}
                      headings={[{ title: '#' }, { title: 'ID' }, { title: 'Status' }, { title: 'Error' }]}
                      selectable={false}
                    >
                      {[...results].reverse().map((r, i) => (
                        <IndexTable.Row key={i} id={i.toString()} position={i}>
                          <IndexTable.Cell>{results.length - i}</IndexTable.Cell>
                          <IndexTable.Cell>{r.id}</IndexTable.Cell>
                          <IndexTable.Cell>
                            <Badge tone={r.success ? 'success' : 'critical'}>{r.success ? 'Success' : 'Failed'}</Badge>
                          </IndexTable.Cell>
                          <IndexTable.Cell>{r.error || '-'}</IndexTable.Cell>
                        </IndexTable.Row>
                      ))}
                    </IndexTable>
                  </div>
                </BlockStack>
              </LegacyCard>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={removeMode === "update" ? "Confirm Metafield Update" : "Confirm Metafield Deletion"}
        primaryAction={{
          content: removeMode === "update" ? "Update" : "Delete",
          onAction: handleConfirm,
          destructive: removeMode !== 'update',
        }}
        secondaryActions={[{ content: "Cancel", onAction: () => setModalOpen(false) }]}
      >
        <Modal.Section>
          <Text as="p">
            {removeMode === "all"
              ? "This metafield will be deleted from ALL items. This action cannot be undone."
              : removeMode === "update"
                ? `This metafield will be updated/added for the selected ${specificField}'s in the CSV.`
                : `This metafield will be deleted only for the selected ${specificField}'s in the CSV.`}
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
