import { useState, useEffect, useCallback } from "react";
import { useFetcher, useOutletContext, useNavigate } from "react-router";
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
  ResourceList,
  ResourceItem,
} from "@shopify/polaris";
import {
  SearchIcon,
  DeleteIcon,
  FileIcon,
  CheckCircleIcon,
  RefreshIcon,
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

type AppOutletContext = {
  planData: any;
};

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
  const navigate = useNavigate();
  const { planData } = useOutletContext<AppOutletContext>();
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
  const [warning, setWarning] = useState<{ active: boolean; title: string; message: string; tone?: 'success' | 'warning' }>({
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
  const [showInfo, setshowInfo] = useState("");
  const [showInfoMeta, setshowInfoMeta] = useState(false);
  let plan = planData?.plan || 'FREE';

  console.log(planData, "planDataMeta");

  const updateMetaLimit = (metaUpdateCsvLimit: number, planData: any) => {
    fetcher.submit(
      {
        plan: planData?.plan,
        updates: {
          metaUpdateCsvLimit: planData?.limits?.metaUpdateCsvLimit - metaUpdateCsvLimit,
          metaUpdate: planData?.limits?.metaUpdate - 1,
        },
      },
      {
        method: "POST",
        encType: "application/json",
        action: "/api/update/plan",
      }
    );
  };

  const removeMetaLimit = (metaRemoveCsvCount: number, planData: any) => {
    fetcher.submit(
      {
        plan: planData?.plan,
        updates: {
          metaRemoveCsvLimit: planData?.limits?.metaRemoveCsvLimit - metaRemoveCsvCount,
          metaRemove: planData?.limits?.metaRemove - 1,
        },
      },
      {
        method: "POST",
        encType: "application/json",
        action: "/api/update/plan",
      }
    );
  };

  const globalMetaLimit = (planData: any) => {
    fetcher.submit(
      {
        plan: planData?.plan,
        updates: {
          metaGlobal: planData?.limits?.metaGlobal - 1,
          metaRemove: planData?.limits?.metaRemove - 1,
        },
      },
      {
        method: "POST",
        encType: "application/json",
        action: "/api/update/plan",
      }
    );
  };


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

  // --- Core Utility Functions ---
  function downloadResultsCSV(results, removeMode) {
    if (!results || results.length === 0) {
      setAlert({
        active: true,
        title: "No Results",
        message: "No results to download!",
        tone: 'critical'
      });
      setWarning((prev) => ({ ...prev, active: false }));
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
      console.log(results, 'results......');
      rows = results.map((r) => [
        csvSafe(r.id),
        csvSafe(r.key),
        csvSafe(r.value),
        csvSafe(r.success ? "true" : "false"),
        csvSafe(r.error || r.errors),
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

  const handleCsvInput = useCallback(async (_dropFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
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
        setWarning((prev) => ({ ...prev, active: false }));
        setCsvRows([]); setCsvData(0); return;
      }

      const headers = parsed[0].map(h => h.trim().toLowerCase());
      const dataRows = parsed.slice(1);

      if (!headers.includes(specificField.toLowerCase()) || !headers.includes("value")) {
        setAlert({ active: true, title: "Missing Columns", message: `CSV must contain '${specificField}' and 'value' columns.`, tone: 'critical' });
        setWarning((prev) => ({ ...prev, active: false }));
        setCsvRows([]); setCsvData(0); return;
      }

      const idIndex = headers.indexOf(specificField.toLowerCase());
      const valueIndex = headers.indexOf("value");
      console.log(valueIndex, '.......rowqqqqqqs');

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
          setWarning(prev => ({ ...prev, active: false }))
          hasInvalidGid = true;
          return null;
        }

        let normalizedValue;
        let error = "";

        try {
          const safeValue =
            value === null || value === undefined
              ? ""
              : String(value).trim();
          // console.log(safeValue, '.......rows');

          normalizedValue = normalizeMetafieldValue(
            selectedMetafield.type,
            safeValue
          );
        } catch (e) {
          error = e.message;
        }

        console.log(normalizedValue, '.......rows');

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
        setWarning(prev => ({ ...prev, active: false }))
        setCsvRows([]); setCsvData(0); return;
      }
      if (rows.length === 0) {
        setAlert({ active: true, title: "Valid Record Not Found", message: "No valid records found in the CSV file.", tone: 'critical' });
        setWarning(prev => ({ ...prev, active: false }))
        setCsvRows([]); setCsvData(0); return;
      }
      if (rows.length > planData?.limits?.metaUpdateCsvLimit && plan !== 'ADVANCED') {
        setWarning({
          active: true,
          title: "Limit Exceeded",
          message: `You only have ${planData?.limits?.metaUpdateCsvLimit} records remaining according to your plan. Please update your plan to add more.`,
          tone: "warning",
        });
        setAlert({ ...alert, active: false })
        return;
      }
      setCsvRows(rows);
      setCsvData(rows.length);
      setResults([]);
      setProgress(0);
      setCurrentIndex(0);
      setAccumulatedResults([]);
      setAlert({ ...alert, active: false })
      setWarning(prev => ({ ...prev, active: false }))

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
              setWarning(prev => ({ ...prev, active: false }))
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
            setWarning(prev => ({ ...prev, active: false }))
            setCsvRows([]); setCsvData(0); return;
          }
          if (rows.length === 0) {
            setAlert({ active: true, title: "Valid Record Not Found", message: "No valid records found. Please follow the CSV Format", tone: 'critical' });
            setWarning(prev => ({ ...prev, active: false }))
            setCsvRows([]); setCsvData(0); return;
          }
          if (rows.length > planData?.limits?.metaRemoveCsvLimit && plan !== 'ADVANCED') {
            setWarning({
              active: true,
              title: "Limit Exceeded",
              message: `You only have ${planData?.limits?.metaRemoveCsvLimit} records remaining according to your plan. Please update your plan to add more.`,
              tone: "warning",
            });
            setAlert({ ...alert, active: false })
            return;
          }

          setCsvData(rows.length);
          setCsvRows(rows);
          setResults([]);
          setProgress(0);
          setCurrentIndex(0);
          setAccumulatedResults([]);
          setWarning(prev => ({ ...prev, active: false }))
          setAlert({ ...alert, active: false })
        },
        error: (err) => {
          setAlert({ active: true, title: "Parsing Error", message: "Failed to parse CSV file.", tone: 'critical' });
          setCsvRows([]); setCsvData(0);
        }
      });
    }
  }, [removeMode, listRemoveMode, listUpdateMode, specificField, objectType, planData, selectedMetafield]);

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

    // if (type?.includes("_reference") && !type?.includes("metaobject_reference")) {
    //   if (!value.trim().startsWith("gid://")) {
    //     throw new Error("Invalid GID reference");
    //   }
    //   return value.trim();
    // }

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
        if (value.toLowerCase() === "true" || value === true) return "true";
        if (value.toLowerCase() === "false" || value === false) return "false";
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
      setWarning(prev => ({ ...prev, active: false }))
      return;
    }
    if (["specific", "update"].includes(removeMode) && !csvRows.length) {
      setAlert({ active: true, title: "Missing CSV", message: `Upload a CSV file with ${specificField}'s (and values for update)!`, tone: 'critical' });
      setWarning(prev => ({ ...prev, active: false }))
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
      if (planData?.limits?.metaGlobal === 0 && plan !== 'ADVANCED') {
        setWarning({
          active: true,
          title: "Limit Exceeded",
          message: "Your global metafield removal limit has been reached. Please upgrade your plan to continue.",
          tone: "warning",
        });

        return;
      } else {
        setIsDeleting(true);
        const formData = new FormData();
        formData.append("mode", "removeMetafield");
        formData.append("objectType", objectType);
        formData.append("namespace", selectedMetafield.namespace);
        formData.append("key", selectedMetafield.key);
        fetcher.submit(formData, { method: "post" });
      }
    } else if (removeMode === "specific") {
      if (planData?.limits?.metaRemove === 0 && plan !== 'ADVANCED') {
        setWarning({
          active: true,
          title: "Limit Exceeded",
          message: "Your specific metafield removal limit has been reached. Please upgrade your plan to continue.",
          tone: "warning",
        });
        return;
      } else {
        setIsDeleting(true);
      }
    } else if (removeMode === "update") {
      if (planData?.limits?.metaUpdate === 0 && plan !== 'ADVANCED') {
        setWarning({
          active: true,
          title: "Limit Exceeded",
          message: "Your update metafield removal limit has been reached. Please upgrade your plan to continue.",
          tone: "warning",
        });

        return;
      } else {
        setIsDeleting(true);
      }
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
    setWarning(prev => ({ ...prev, active: false }))
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
    setWarning(prev => ({ ...prev, active: false }))
  };

  const handleClearCSV = () => {
    setCsvRows([]);
    setCsvData(0);
    setFileName(null);
  };

  // --- Effects for Processing ---
  useEffect(() => {
    if (fetcher.state !== "idle" || !fetcher.data) return;
    const data = fetcher?.data;
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
    const typeName = selectedMetafield?.type?.name;

    // Reset
    setshowInfo("");
    setshowInfoMeta(false);

    if (!typeName) return;

    const isList = typeName.startsWith("list.");
    const normalizedType = isList ? typeName.replace("list.", "") : typeName;

    if (!normalizedType.endsWith("_reference")) return;

    const referenceMessageMap = {
      product: "product handle",
      collection: "collection handle",
      customer: "customer email",
      order: "order name",
      blogpost: "blog post handle",
      variant: "variant SKU",
      company: "company external ID",
      location: "location name",
      metaobject: "location handle",
    };

    // remove "_reference"
    const key = normalizedType?.toLowerCase().replace(/_reference$/, "");
    const referenceLabel = referenceMessageMap[key];
    console.log(key, 'referenceLabel',);
    if (!referenceLabel) return;

    setshowInfo(
      isList
        ? `CSV values can be multiple ${referenceLabel}s or Shopify GIDs (comma-separated).`
        : `CSV value can be a ${referenceLabel} or a Shopify GID.`
    );

    setshowInfoMeta(true);
  }, [selectedMetafield, objectType]);

  const handleDownloadTemplate = () => {
    const currentField = specificField;
    const currentType = csvType;
    const currentObjectType = objectType;

    const header = currentField === "Id" ? "Id" : currentType;

    const gidMap = {
      product: "Product",
      customer: "Customer",
      order: "Order",
      articles: "Article",
      blog: "Blog",
      page: "Page",
      productVariant: "ProductVariant",
      company: "Company",
      companyLocation: "CompanyLocation",
      location: "Location",
      market: "Market",
      collection: "Collection",
    };

    const gidType = gidMap[currentObjectType] || "Unknown";

    let sampleIds = [];

    if (header === "Id") {
      sampleIds = [
        `gid://shopify/${gidType}/123456789`,
        `gid://shopify/${gidType}/987654321`,
      ];
    } else if (header === "Sku") {
      sampleIds = ["SKU-1001", "SKU-1002"];
    } else if (header === "Email") {
      sampleIds = ["user1@example.com", "user2@example.com"];
    } else if (header === "Name") {
      sampleIds = ["#1001", "#1002"];
    } else if (header === "Handle") {
      sampleIds = ["sample-handle-1", "sample-handle-2"];
    } else if (header === "External_ID") {
      sampleIds = ["EXT-1001", "EXT-1002"];
    }

    let csvContent = "";

    // ------------------ SPECIFIC REMOVE (ID ONLY) ------------------
    if (removeMode === "specific" && listRemoveMode !== "partial") {
      console.log("specific remove");
      csvContent = [header, ...sampleIds].join("\n");
    }

    // ------------------ UPDATE / PARTIAL WITH VALUE ------------------
    else if (
      (removeMode === "update" || removeMode === "specific") &&
      selectedMetafield?.type?.name
    ) {
      const typeName = selectedMetafield?.type?.name;
      const valueSamples = getMetafieldSampleValues(typeName);

      const rows = [
        `${header},value`,
        ...sampleIds.map(
          (id, i) => `${id},${valueSamples[i] || valueSamples[0]}`
        ),
      ];


      csvContent = rows.join("\n");
    }

    // ------------------ DOWNLOAD ------------------
    if (csvContent) {
      const blob = new Blob([csvContent], {
        type: "text/csv;charset=utf-8;",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `sample-${header}-template-${Date.now()}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    }
  };

  function getMetafieldSampleValues(typeName) {
    const isList = typeName.startsWith("list.");
    const baseType = isList ? typeName.replace("list.", "") : typeName;

    // Helper: make value CSV-safe (single column guaranteed)
    const csvSafe = (value) =>
      `"${String(value).replace(/"/g, '""').replace(/\r?\n/g, "\\n")}"`;

    // Helper: rich text generator (Shopify-compliant)
    const richText = (text, boldWord) =>
      csvSafe(
        JSON.stringify({
          type: "root",
          children: [
            {
              type: "paragraph",
              children: boldWord
                ? [
                  { type: "text", value: `${text} ` },
                  { type: "text", value: boldWord, bold: true },
                ]
                : [{ type: "text", value: text }],
            },
          ],
        })
      );

    const samples = {
      /* ---------------- TEXT ---------------- */
      single_line_text_field: ["Sample text", "Another text"],
      multi_line_text_field: [
        csvSafe("Line one\nLine two"),
        csvSafe("Second multi-line value"),
      ],

      rich_text_field: [
        richText("This is", "rich text"),
        richText("Another paragraph"),
      ],

      /* ---------------- EMAIL ---------------- */
      email: ["user@example.com", "admin@example.com"],

      /* ---------------- NUMBER ---------------- */
      number_integer: ["10", "25"],
      number_decimal: ["10.5", "25.75"],
      rating: ["4.5", "3.0"],

      /* ---------------- MONEY / DIMENSIONS ---------------- */
      money: [
        csvSafe('{"amount":"10.00","currency_code":"USD"}'),
        csvSafe('{"amount":"99.99","currency_code":"USD"}'),
      ],

      weight: [
        csvSafe('{"value":1.5,"unit":"kg"}'),
        csvSafe('{"value":3,"unit":"kg"}'),
      ],

      volume: [
        csvSafe('{"value":2.5,"unit":"l"}'),
        csvSafe('{"value":5,"unit":"l"}'),
      ],

      dimension: [
        csvSafe('{"value":10,"unit":"cm"}'),
        csvSafe('{"value":25,"unit":"cm"}'),
      ],


      /* ---------------- BOOLEAN ---------------- */
      boolean: ["true", "false"],

      /* ---------------- DATE ---------------- */
      date: ["2025-01-01", "2025-12-31"],
      date_time: ["2025-01-01T10:00:00Z", "2025-12-31T18:30:00Z"],

      /* ---------------- COLOR ---------------- */
      color: ["#FF0000", "#00FF00"],

      /* ---------------- LINK / URL ---------------- */
      url: ["https://example.com", "https://shopify.com"],
      link: [
        csvSafe('{"type":"URL","value":"https://example.com"}'),
        csvSafe('{"type":"URL","value":"https://shopify.com"}'),
      ],

      /* ---------------- JSON ---------------- */
      json: [
        csvSafe('{"key":"value"}'),
        csvSafe('{"enabled":true,"count":5}'),
      ],

      /* ---------------- FILE / MEDIA ---------------- */
      file_reference: [
        "gid://shopify/MediaImage/123456789",
        "gid://shopify/MediaImage/987654321",
      ],

      /* ---------------- REFERENCES ---------------- */
      product_reference: [
        "gid://shopify/Product/123456789",
        "gid://shopify/Product/987654321",
      ],
      variant_reference: [
        "gid://shopify/ProductVariant/123456789",
        "gid://shopify/ProductVariant/987654321",
      ],
      collection_reference: [
        "gid://shopify/Collection/123456789",
        "gid://shopify/Collection/987654321",
      ],
      customer_reference: [
        "gid://shopify/Customer/123456789",
        "gid://shopify/Customer/987654321",
      ],
      order_reference: [
        "gid://shopify/Order/123456789",
        "gid://shopify/Order/987654321",
      ],
      page_reference: [
        "gid://shopify/Page/123456789",
        "gid://shopify/Page/987654321",
      ],
      blog_reference: [
        "gid://shopify/Blog/123456789",
        "gid://shopify/Blog/987654321",
      ],
      company_reference: [
        "gid://shopify/Company/123456789",
        "gid://shopify/Company/987654321",
      ],
      metaobject_reference: [
        "gid://shopify/Metaobject/123456789",
        "gid://shopify/Metaobject/987654321",
      ],
    };

    const baseSamples = samples[baseType] || ["sample-1", "sample-2"];

    // LIST metafields → comma-separated (still CSV-safe)
    if (isList) {
      return [
        csvSafe(baseSamples.map(v => v.replace(/^"|"$/g, "")).join(",")),
        csvSafe(baseSamples.map(v => v.replace(/^"|"$/g, "")).reverse().join(",")),
      ];
    }

    return baseSamples;
  }

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
    setWarning(prev => ({ ...prev, active: false }))
  }, [removeMode]);

  useEffect(() => {
    if (progress === 100 && !isDeleting) {
      const TrueResult = results.filter((r) => r?.success);

      if (!TrueResult.length) return;

      let operation = "";
      let formattedResults = TrueResult;

      if (removeMode === "specific" && listRemoveMode === "partial") {
        operation = "Metafield-removed";
        formattedResults = TrueResult.map((r) => ({
          ...r,
          data: {
            namespace: r.namespace,
            key: r.key,
            type: r.type,
            value: toJsonArrayString(r.data),
          },
        }));
      }

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

      if (
        removeMode === "all" ||
        (removeMode === "specific" && listRemoveMode !== "partial")
      ) {
        operation = "Metafield-removed";
        formattedResults = TrueResult.map((r) => {
          if (r.data && typeof r.data === "object" && !Array.isArray(r.data)) {
            return {
              ...r,
              namespace: r.data.namespace || r.namespace,
              key: r.data.key || r.key,
              value: r.data.value,
              type: r.data.type || r.type,
            };
          }
          return r;
        });
      }

      if (formattedResults.length > 0 && operation) {
        const Data = {
          operation,              // only operation
          objectType,             // only objectType
          value: formattedResults, // only value
        };
        console.log("Dassssssssssta", Data)
        if (plan !== 'ADVANCED') {
          if (operation === "Metafield-removed" && removeMode !== "all") { removeMetaLimit(formattedResults?.length, planData) }
          if (operation === "Metafield-removed" && removeMode === "all") { globalMetaLimit(planData) }
          if (operation === "Metafield-updated") { updateMetaLimit(formattedResults?.length, planData) }
        }
        fetch("/api/add/db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Data),
        }).catch((err) => console.error("Logging error", err));
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
    setSpecificField("Id")
    setAlert(prev => ({ ...prev, active: false }));
    setWarning(prev => ({ ...prev, active: false }))
  }, [listRemoveMode, listUpdateMode]);

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
    setWarning(prev => ({ ...prev, active: false }))
  }, [specificField]);

  function goToHome() {
    if (!(isDeleting && progress > 0)) navigate("/app");
  }

  return (
    <Page
      title="Metafield Manage"
      subtitle="Manage and sync custom field data across your store."
      backAction={{ content: "Home", onAction: goToHome }}
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
            {warning.active && (
              <Banner
                title={warning.title}
                tone={warning.tone}
                onDismiss={() => setWarning(prev => ({ ...prev, active: false }))}
              >
                <p>{warning.message}</p>
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
                        {showInfoMeta && (
                          <Banner tone="info">
                            <p>{showInfo}</p>
                          </Banner>
                        )}
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

                            <DropZone onDrop={handleCsvInput} accept=".csv" allowMultiple={false} disabled={isDeleting}>
                              <DropZone.FileUpload actionTitle="Add CSV File" />
                            </DropZone>
                            {plan === "ADVANCED" && <Text as="p" tone="subdued">Only 5000 records will add at a time</Text>}
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
                          <IndexTable.Cell>{r.error || r.errors || '-'}</IndexTable.Cell>
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
