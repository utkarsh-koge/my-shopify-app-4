import { useState, useEffect, useCallback } from "react";
import { useFetcher, useNavigate, useOutletContext } from "react-router";
import { authenticate } from "../shopify.server";
import type { LoaderFunctionArgs } from "react-router";
import {
  handleFetch,
  handleRemoveFromAll,
  handleRemoveSpecific,
} from "app/functions/remove-tag-action";
import Papa from "papaparse";
import {
  Page,
  Layout,
  LegacyCard,
  Select,
  TextField,
  Button,
  Banner,
  BlockStack,
  DropZone,
  IndexTable,
  Text,
  Badge,
  Box,
  InlineStack,
  ProgressBar,
  Modal,
  Spinner,
  EmptyState,
  ChoiceList,
  ButtonGroup,
  useBreakpoints,
} from "@shopify/polaris";
import { PlusIcon, XIcon } from "@shopify/polaris-icons";

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

export const action = async ({ request }) => {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();
    const mode = formData.get("mode");

    if (mode === "fetch") {
      return await handleFetch(admin, formData);
    }
    if (mode === "remove-global") {
      return await handleRemoveFromAll(admin, formData);
    }
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
  const { planData } = useOutletContext<AppOutletContext>();
  const breakpoints = useBreakpoints();


  // State
  const [objectType, setObjectType] = useState("product");
  const [matchType, setMatchType] = useState("contain");
  const [conditions, setConditions] = useState([{ tag: "", operator: "OR" }]);
  const [fetchedItems, setFetchedItems] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [removalMode, setRemovalMode] = useState<"global" | "specific">(
    "global",
  );
  const [csvIds, setCsvIds] = useState<string[]>([]);

  // Modals & Alerts
  const [modalOpen, setModalOpen] = useState(false);
  const [alert, setAlert] = useState<{
    active: boolean;
    title: string;
    message: string;
    tone?: "critical" | "success";
  }>({
    active: false,
    title: "",
    message: "",
  });
  const [warning, setWarning] = useState<{ active: boolean; title: string; message: string; tone?: 'success' | 'warning' }>({
    active: false,
    title: "",
    message: "",
  });
  const [isRemoving, setIsRemoving] = useState(false);
  const [noTagsFound, setNoTagsFound] = useState(false);
  const [specificField, setSpecificField] = useState("Id");
  const [csvType, setCsvType] = useState("Id"); // Default for product
  const [currentrow, setcurrentrow] = useState<string>();
  const [allFetchedTags, setAllFetchedTags] = useState<string[]>([]);
  const [isFetchingTags, setIsFetchingTags] = useState(false);

  // Results
  const [finalSpecificResults, setFinalSpecificResults] = useState<any[]>([]);
  const [csvIndex, setCsvIndex] = useState(1);
  const [search, setSearch] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [specificEnd, setSpecificEnd] = useState(false);

  let plan = planData?.plan || 'FREE';
  // Global Results
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

  const isFetching = fetcher.state !== "idle" && fetcher.formData?.get("mode") === "fetch";
  const isActionDisabled = isRemoving;
  console.log(planData, "planDatatagremove");

  const updateTagRemoveCsvLimit = (tagRemoveCsvCount: number, planData: any) => {
    fetcher.submit(
      {
        plan: planData?.plan,
        updates: {
          tagRemoveCsvLimit: planData?.limits?.tagRemoveCsvLimit - tagRemoveCsvCount,
          tagRemove: planData?.limits?.tagRemove - 1,
        },
      },
      {
        method: "POST",
        encType: "application/json",
        action: "/api/update/plan",
      }
    );
  };

  const updateTagGlobalLimit = (planData: any) => {
    fetcher.submit(
      {
        plan: planData?.plan,
        updates: {
          tagGlobal: planData?.limits?.tagGlobal - 1,
          tagRemove: planData?.limits?.tagRemove - 1,
        },
      },
      {
        method: "POST",
        encType: "application/json",
        action: "/api/update/plan",
      }
    );
  };

  // -- Helpers --
  function filterTagsBasedOnConditions(
    allTags: string[],
    conditions: any[],
    matchType: string,
  ) {
    if (!conditions?.length) return allTags;

    const match = (tag: string, cond: any) => {
      const value = cond.tag.trim().toLowerCase();
      const t = tag.toLowerCase();
      switch (matchType) {
        case "exact":
          return t === value;
        case "start":
          return t.startsWith(value);
        case "end":
          return t.endsWith(value);
        default:
          return t.includes(value);
      }
    };

    let result = allTags.filter((tag) => match(tag, conditions[0]));
    for (let i = 1; i < conditions.length; i++) {
      const cond = conditions[i];
      if (cond.tag === "") continue;
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
    if (planData?.limits?.tagRemove === 0 && plan !== 'ADVANCED') {
      setWarning({
        active: true,
        title: "Limit Exceeded",
        message: "Your tag remove limit has been reached. Please upgrade your plan to continue.",
        tone: "warning",
      });
    } else {
      setAllFetchedTags([]);
      setFetchedItems([]);
      setNoTagsFound(false);
      setIsFetchingTags(true);
      setSearch(true);
      setRemovalMode("global");
      if (objectType === "product") setCsvType("Sku");
      else if (objectType === "customer") setCsvType("Email");
      else if (objectType === "order") setCsvType("Name");
      else if (objectType === "article") setCsvType("Handle");

      const last = conditions[conditions.length - 1];
      if (last && last.tag.trim() === "") return;

      const lastTag = last.tag.trim();
      const isDuplicate = conditions.some(
        (c, idx) =>
          idx !== conditions.length - 1 &&
          c.tag.trim().toLowerCase() === lastTag.toLowerCase(),
      );

      if (isDuplicate) {
        setAlert({
          active: true,
          title: "Duplicate Tag",
          message: `The tag "${lastTag}" is already added.`,
          tone: "critical",
        });
        setWarning(prev => ({ ...prev, active: false }))
        return;
      }
      setSpecificField("Id");
      setFileName(null);
      setAlert((prev) => ({ ...prev, active: false }));
      setWarning(prev => ({ ...prev, active: false }))
      const fd = new FormData();
      fd.append("mode", "fetch");
      fd.append("objectType", objectType);
      fetcher.submit(fd, { method: "POST" });
    }
  }

  // UseEffects for Fetching Logic
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
    if (search && allFetchedTags.length === 0) {
      setNoTagsFound(true);
    }
  }, [isFetchingTags]);

  useEffect(() => {
    if (!fetcher.data) return;
    const data = fetcher.data;

    // Fetch Mode
    if (data.mode === "fetch" && data.success) {
      setAllFetchedTags((prev) => [...prev, ...data.tags]);
      if (data.hasNextPage) {
        const fd = new FormData();
        fd.append("mode", "fetch");
        fd.append("objectType", objectType);
        fd.append("cursor", data.nextCursor);
        fetcher.submit(fd, { method: "POST" });
      } else {
        setRemovalMode("global");
        setIsFetchingTags(false);
      }
    }

    // Specific Remove Mode
    if (data.mode === "remove-specific") {
      const updatedResults = data.results.map((item: any) => ({
        ...item,
        row: currentrow,
      }));
      setFinalSpecificResults((prev) => [...prev, ...updatedResults]);
      const nextIndex = csvIndex + 1;
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
        setSpecificEnd(true);
        setIsRemoving(false);
      }
      return;
    }

    // Global Remove Mode
    if (data.mode === "remove-global") {
      setGlobalResult((prev: any) => {
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
      if (data.hasNextPage) {
        const fd = new FormData();
        fd.append("objectType", objectType);
        fd.append("tags", JSON.stringify(selectedTags));
        fd.append("mode", "remove-global");
        fd.append("cursor", data.nextCursor);
        setTimeout(() => {
          fetcher.submit(fd, { method: "POST" });
        }, 200);
      } else {
        setIsRemoving(false);
      }
      return;
    }
  }, [fetcher.data]);

  // Prevent unload during removal
  // Logging
  useEffect(() => {
    let results = [];

    if (globalResult.complete && globalResult.results.length > 0) {
      results = globalResult.results;
    }

    if (specificEnd && finalSpecificResults.length > 0) {
      const successRows = finalSpecificResults.filter((r) => r.success);
      if (successRows.length > 0) results = successRows;
    }

    if (results.length > 0) {
      if (plan !== 'ADVANCED') {
        if (removalMode === 'global') {
          updateTagGlobalLimit(planData);
        } else {
          updateTagRemoveCsvLimit(results.length, planData)
        }
      }
      const Data = {
        operation: "Tags-removed", // only operation
        objectType: objectType === "article" ? "blogPost" : objectType, // only objectType
        value: results, // only value
      };


      fetch("/api/add/db", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Data),
      }).catch((err) => console.error("Logging error", err));
    }
  }, [specificEnd, globalResult.results]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRemoving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isRemoving]);

  useEffect(() => {
    if (selectedTags.length === 0) {
      setCsvIds([]);
      setFileName(null);
      setAlert((prev) => ({ ...prev, active: false }));
      setWarning((prev) => ({ ...prev, active: false }));
    }
  }, [selectedTags]);

  // Logic helpers
  const handleClearCSV = () => {
    setCsvIds([]);
    setFileName(null);
  };

  const handleCsvInput = useCallback(
    (_dropFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) {
        handleClearCSV();
        return;
      }
      setFileName(file.name);
      const normalizedField = specificField.toLowerCase();

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.toLowerCase().trim(),
        complete: (res) => {
          let hasInvalidGid = false;
          const values = res.data
            .map((row: any) => {
              const rawValue = row[normalizedField];
              const id = typeof rawValue === "string" ? rawValue.trim() : null;
              if (!id) return null;

              const gidObjectType = getShopifyObjectTypeFromGid(id);
              if (gidObjectType && gidObjectType !== objectType.toLowerCase()) {
                setAlert({
                  active: true,
                  title: "Invalid Shopify ID",
                  message: `The CSV contains an ID of type "${gidObjectType}", but "${objectType}" was selected.\n\nID: ${id}`,
                  tone: "critical",
                });
                setWarning(prev => ({ ...prev, active: false }))
                hasInvalidGid = true;
                return null;
              }
              return id;
            })
            .filter(Boolean);

          if (hasInvalidGid) {
            handleClearCSV();
            return;
          }
          if (values.length > 5000) {
            setAlert({
              active: true,
              title: "Limit Exceeded",
              message: "Only 5000 records will add at a time",
              tone: "critical",
            });
            setWarning(prev => ({ ...prev, active: false }))
            handleClearCSV();
            return;
          }

          if (values.length > planData?.limits?.tagRemoveCsvLimit && plan !== 'ADVANCED') {
            setWarning({
              active: true,
              title: "Limit Exceeded",
              message: `You only have ${planData?.limits?.tagRemoveCsvLimit} records remaining according to your plan. Please update your plan to add more.`,
              tone: "warning",
            });
            setAlert((prev) => ({ ...prev, active: false }));
            return;
          }

          if (values.length === 0) {
            setAlert({
              active: true,
              title: "Valid Record Not Found",
              message:
                "No valid records found in the CSV file. Please follow the CSV Format",
              tone: "critical",
            });
            setWarning(prev => ({ ...prev, active: false }))
            handleClearCSV();
            return;
          }

          setCsvIds(values as string[]);
          setAlert((prev) => ({ ...prev, active: false }));
          setWarning(prev => ({ ...prev, active: false }))
        },
        error: (err) => {
          setAlert({
            active: true,
            title: "Parsing Error",
            message: "Failed to parse CSV file.",
            tone: "critical",
          });
          setWarning(prev => ({ ...prev, active: false }))
          handleClearCSV();
        },
      });
    },
    [specificField, planData, objectType],
  );

  function getShopifyObjectTypeFromGid(gid: string) {
    if (typeof gid !== "string") return null;
    const match = gid.match(/^gid:\/\/shopify\/([^/]+)\/\d+$/);
    return match ? match[1].toLowerCase() : null;
  }

  const downloadResultCSV = () => {
    let result: any[] = [];
    let header = "";
    let rows: string[] = [];

    if (removalMode === "global") {
      result = globalResult?.results || [];
      header = ["Id", "Tags", "Success", "Error"].join(",") + "\n";
      rows = result.map((r) => {
        const id = r.id || "";
        const removedTags = Array.isArray(r.removedTags)
          ? r.removedTags.join(", ")
          : "";
        const success = r.success ? "true" : "false";
        const error = r.error || "";
        return `"${id}","${removedTags}","${success}","${error}"`;
      });
    } else {
      result = finalSpecificResults;
      header = [specificField, "Tags", "Success", "Error"].join(",") + "\n";
      rows = result.map((r) => {
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
    link.download = `tag-removal-results-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = () => {
    const header = specificField === "Id" ? "Id" : csvType;
    let sampleValues: string[] = [];
    if (header === "Id") {
      // Simplified GID logic
      const t = objectType.charAt(0).toUpperCase() + objectType.slice(1);
      sampleValues = [`gid://shopify/${t}/123456789`];
    } else if (header === "Sku") sampleValues = ["SKU-1"];
    else if (header === "Email") sampleValues = ["example@mail.com"];
    else if (header === "Name") sampleValues = ["#1001"];
    else if (header === "Handle") sampleValues = ["handle-1"];

    const csvContent = [header, ...sampleValues].join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([csvContent], { type: "text/csv;charset=utf-8;" }),
    );
    link.download = `sample-${header}-template.csv`;
    link.click();
  };

  const handleRemoveConfirm = () => {
    // Always close modal at the end
    setModalOpen(false);

    // GLOBAL REMOVE
    if (removalMode === "global") {
      if (planData?.limits?.tagGlobal === 0 && plan !== "ADVANCED") {
        setWarning({
          active: true,
          title: "Limit Exceeded",
          message:
            "Your global tag removal limit has been reached. Please upgrade your plan to continue.",
          tone: "warning",
        });
        setAlert((prev) => ({ ...prev, active: false }));
        return; // ⛔ stop execution, no submit
      }

      setIsRemoving(true);
      setFinalSpecificResults([]);
      setGlobalResult(emptyGlobalState);

      const fd = new FormData();
      fd.append("objectType", objectType);
      fd.append("tags", JSON.stringify(selectedTags));
      fd.append("mode", "remove-global");

      fetcher.submit(fd, { method: "POST" });
      return;
    }

    // SPECIFIC REMOVE
    setIsRemoving(true);
    setFinalSpecificResults([]);
    setGlobalResult(emptyGlobalState);

    const fd = new FormData();
    fd.append("objectType", objectType);
    fd.append("tags", JSON.stringify(selectedTags));
    fd.append("mode", "remove-specific");

    setCsvIndex(0);
    setcurrentrow(csvIds[0]);

    fd.append("row", JSON.stringify(csvIds[0]));
    fd.append("flag", JSON.stringify(specificField === "Id"));
    fd.append("resource", JSON.stringify(objectType));

    fetcher.submit(fd, { method: "POST" });
  };

  const resetAll = () => {
    setConditions([{ tag: "", operator: "OR" }]);
    setFetchedItems([]);
    setSelectedTags([]);
    setCsvIds([]);
    setGlobalResult(emptyGlobalState);
    setFinalSpecificResults([]);
    setNoTagsFound(false);
    setIsRemoving(false);
    setSpecificField("Id");
    setRemovalMode("global");
    setSpecificEnd(false);
    setSearch(false);
    setFileName(null);
    setAlert((prev) => ({ ...prev, active: false }));
    setWarning((prev) => ({ ...prev, active: false }));

  };

  useEffect(() => {
    if (removalMode === "global") {
      setSpecificField("Id");
      setCsvIds([]);
      setGlobalResult(emptyGlobalState);
      setFinalSpecificResults([]);
      setNoTagsFound(false);
      setIsRemoving(false);
      setSearch(false);
      setFileName(null);
    }
    setCsvIds([]);
    setFileName(null);
    setAlert((prev) => ({ ...prev, active: false }));
    setWarning((prev) => ({ ...prev, active: false }));

  }, [removalMode, specificField]);

  // Condition Inputs
  const addCondition = () => {
    const last = conditions[conditions.length - 1];
    if (last && last.tag.trim() === "") return;

    const lastTag = last.tag.trim();
    const isDuplicate = conditions.some(
      (c, idx) =>
        idx !== conditions.length - 1 &&
        c.tag.trim().toLowerCase() === lastTag.toLowerCase(),
    );

    if (isDuplicate) {
      setAlert({
        active: true,
        title: "Duplicate Tag",
        message: `The tag "${lastTag}" is already added.`,
        tone: "critical",
      });
      return;
    }
    setAlert((prev) => ({ ...prev, active: false }));
    setWarning((prev) => ({ ...prev, active: false }));
    setConditions((prev) => [...prev, { tag: "", operator: "OR" }]);
  };
  const updateCondition = (i: number, field: string, val: string) => {
    setConditions((prev) =>
      prev.map((c, idx) => (idx === i ? { ...c, [field]: val } : c)),
    );
    setGlobalResult(emptyGlobalState);
    setFinalSpecificResults([]);
  };
  const removeCondition = (i: number) =>
    setConditions((prev) => prev.filter((_, idx) => idx !== i));
  const validTagsEntered = conditions.filter((c) => c.tag.trim().length >= 2);
  const readyToFetch =
    validTagsEntered.length > 0 &&
    conditions.every(
      (c) => c.tag.trim().length === 0 || c.tag.trim().length >= 2,
    );
  const readyToAdd = conditions.every(
    (c) => c.tag.trim().length === 0 || c.tag.trim().length >= 2,
  );

  function goToHome() {
    if (!isRemoving) navigate("/app");
  }

  // Render
  return (
    <Page
      title="Remove Tags"
      subtitle="Search for tags and remove them globally or from specific items."
      backAction={{ content: "Home", onAction: goToHome }}
    >

      <Layout>
        {/* LEFT COLUMN */}
        <Layout.Section variant={breakpoints.mdDown ? "fullWidth" : "oneThird"}>
          <BlockStack gap="500">
            <LegacyCard sectioned>
              <BlockStack gap="400">
                <Select
                  label="Object Type"
                  options={[
                    { label: "Product", value: "product" },
                    { label: "Customer", value: "customer" },
                    { label: "Order", value: "order" },
                    { label: "BlogPost", value: "article" },
                  ]}
                  value={objectType}
                  onChange={(val) => {
                    setObjectType(val);
                    resetAll();
                  }}
                  disabled={isActionDisabled || fetchedItems.length > 0}
                />
                <Select
                  label="Match Type"
                  options={[
                    { label: "Contains", value: "contain" },
                    { label: "Starts With", value: "start" },
                    { label: "Ends With", value: "end" },
                    { label: "Exact Match", value: "exact" },
                  ]}
                  value={matchType}
                  onChange={setMatchType}
                  disabled={isActionDisabled || fetchedItems.length > 0}
                />
                {objectType === "product" && (
                  <Banner tone="warning">
                    <p>
                      Updates may take 2-5 minutes to reflect due to Shopify
                      indexing.
                    </p>
                  </Banner>
                )}
              </BlockStack>
            </LegacyCard>

            <LegacyCard title="Search Conditions" sectioned>
              <BlockStack gap="300">
                {conditions.map((c, i) => (
                  <InlineStack key={i} gap="200" align="center">
                    <div style={{ flex: 1 }}>
                      <TextField
                        label="Tag"
                        labelHidden
                        placeholder="Enter tag (Min 2 chars)"
                        value={c.tag}
                        onChange={(val) => updateCondition(i, "tag", val)}
                        autoComplete="off"
                        disabled={isActionDisabled || fetchedItems.length > 0}
                        connectedRight={
                          conditions.length > 1 && (
                            <Button
                              icon={XIcon}
                              onClick={() => removeCondition(i)}
                              disabled={
                                isActionDisabled || fetchedItems.length > 0
                              }
                            />
                          )
                        }
                      />
                    </div>
                  </InlineStack>
                ))}

                <Button
                  variant="plain"
                  icon={PlusIcon}
                  onClick={addCondition}
                  disabled={
                    !readyToAdd ||
                    isActionDisabled ||
                    fetchedItems.length > 0 ||
                    (conditions.length > 0 &&
                      conditions[conditions.length - 1].tag.trim() === "")
                  }
                >
                  Add Another Tag
                </Button>

                <ButtonGroup fullWidth>
                  <Button
                    variant="primary"
                    onClick={startFetchTags}
                    loading={isFetching}
                    disabled={
                      isActionDisabled ||
                      !readyToFetch ||
                      fetchedItems.length > 0
                    }
                  >
                    Fetch Tags
                  </Button>
                  {fetchedItems.length > 0 && (
                    <Button onClick={resetAll} disabled={isActionDisabled}>
                      Reset
                    </Button>
                  )}
                </ButtonGroup>
              </BlockStack>
            </LegacyCard>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="500">
            {alert.active && (
              <Banner
                title={alert.title}
                tone={alert.tone}
                onDismiss={() =>
                  setAlert((prev) => ({ ...prev, active: false }))
                }
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

            {/* 1. Fetching Loading */}
            {isFetching && (
              <LegacyCard sectioned>
                <BlockStack align="center" inlineAlign="center" gap="400">
                  <Spinner size="large" />
                  <Text as="h3" variant="headingMd">
                    Scanning Store Tags
                  </Text>
                  <Text as="p" tone="subdued">
                    Searching through your {objectType}s...
                  </Text>
                </BlockStack>
              </LegacyCard>
            )}

            {/* 2. Empty State */}
            {!isFetching &&
              !noTagsFound &&
              fetchedItems.length === 0 &&
              !isRemoving &&
              !globalResult.complete &&
              !specificEnd && (
                <LegacyCard sectioned>
                  <EmptyState
                    heading="Ready to Search"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>
                      Select an object type on the left, enter tags, and click
                      Fetch Tags.
                    </p>
                  </EmptyState>
                </LegacyCard>
              )}

            {/* 3. No Tags Found */}
            {noTagsFound &&
              !isFetching &&
              fetchedItems.length === 0 &&
              !alert.active && !isFetchingTags && noTagsFound && (
                <Banner
                  title="No tags found"
                  tone="info"
                  onDismiss={() => setNoTagsFound(false)}
                >
                  <p>Try adjusting your search conditions or Match Type.</p>
                  <Button variant="plain" onClick={resetAll}>
                    Reset Search
                  </Button>
                </Banner>
              )}

            {/* 4. Results & Selection */}
            {!isFetching &&
              fetchedItems.length > 0 &&
              !isRemoving &&
              !globalResult.complete &&
              !specificEnd && (
                <BlockStack gap="400">
                  <LegacyCard
                    title={`Select Tags to Remove (${fetchedItems.length} found)`}
                    sectioned
                  >
                    <BlockStack gap="200">
                      <Box
                        padding="200"
                        background="bg-surface-secondary"
                        borderRadius="200"
                      >
                        <InlineStack gap="200" wrap>
                          {fetchedItems.map((tag) => {
                            const isSelected = selectedTags.includes(tag);
                            return (
                              <Button
                                key={tag}
                                size="slim"
                                pressed={isSelected}
                                variant={isSelected ? "primary" : "secondary"}
                                onClick={() =>
                                  setSelectedTags((prev) =>
                                    prev.includes(tag)
                                      ? prev.filter((t) => t !== tag)
                                      : [...prev, tag],
                                  )
                                }
                              >
                                {tag}
                              </Button>
                            );
                          })}
                        </InlineStack>
                      </Box>
                      {selectedTags.length > 0 && (
                        <Button
                          variant="plain"
                          tone="critical"
                          onClick={() => setSelectedTags([])}
                        >
                          Clear Selection
                        </Button>
                      )}
                    </BlockStack>
                  </LegacyCard>

                  {selectedTags.length > 0 && (
                    <LegacyCard title="Removal Method" sectioned>
                      <BlockStack gap="400">
                        <ChoiceList
                          title=""
                          choices={[
                            {
                              label: "Global Removal (All items store-wide)",
                              value: "global",
                            },
                            {
                              label: "Specific Removal (From CSV)",
                              value: "specific",
                            },
                          ]}
                          selected={[removalMode]}
                          onChange={(val) => setRemovalMode(val[0] as any)}
                          disabled={isActionDisabled}
                        />

                        {removalMode === "specific" && (
                          <Box
                            padding="400"
                            background="bg-surface-secondary"
                            borderRadius="200"
                          >
                            <BlockStack gap="200">
                              <ChoiceList
                                title="Match by"
                                choices={[
                                  { label: "Shopify GID", value: "Id" },
                                  { label: csvType, value: csvType },
                                ]}
                                selected={[specificField]}
                                onChange={(val) => setSpecificField(val[0])}
                              />
                              <Button
                                variant="plain"
                                onClick={handleDownloadTemplate}
                              >
                                Download Sample CSV
                              </Button>
                              <DropZone
                                onDrop={handleCsvInput}
                                accept=".csv"
                                allowMultiple={false}
                                disabled={isActionDisabled}
                              >
                                {fileName ? (
                                  <DropZone.FileUpload actionTitle="Replace file" />
                                ) : (
                                  <DropZone.FileUpload actionTitle="Add file" />
                                )}

                              </DropZone>
                              {fileName && (
                                <Text as="p" tone="success">
                                  {fileName} — {csvIds.length} records.
                                </Text>
                              )}
                              {plan === "ADVANCED" && <Text as="p" tone="subdued">Only 5000 records will add at a time</Text>}
                            </BlockStack>

                          </Box>
                        )}

                        <Button
                          variant="primary"
                          tone="critical"
                          fullWidth
                          disabled={
                            removalMode === "specific" && csvIds.length === 0
                          }
                          onClick={() => {
                            if (!csvIds.length && removalMode !== "global") {
                              setAlert({
                                active: true,
                                title: "Missing CSV",
                                message: "Upload CSV first",
                                tone: "critical",
                              });
                              return;
                            }
                            setModalOpen(true);
                          }}
                        >
                          Remove Selected Tags
                        </Button>
                      </BlockStack>
                    </LegacyCard>
                  )}
                </BlockStack>
              )}

            {/* 5. Removing Progress */}
            {isRemoving && (
              <LegacyCard sectioned>
                <BlockStack gap="600" align="center" inlineAlign="center">
                  {/* Header Section */}
                  <BlockStack gap="200" align="center" inlineAlign="center">
                    <div style={{ marginBottom: "8px" }}>
                      <Spinner size="large" />
                    </div>
                    <Text as="h2" variant="headingLg">
                      Removing tags
                    </Text>
                    <Text as="p" tone="subdued" alignment="center">
                      {removalMode === "global"
                        ? "We're processing your request. This may take a moment."
                        : "Please keep this browser tab open until the removal is complete."}
                    </Text>
                  </BlockStack>

                  {/* Progress & Stats Section */}
                  <Box width="100%" maxWidth="400px">
                    <BlockStack gap="400">
                      {removalMode !== "global" && (
                        <BlockStack gap="200">
                          <ProgressBar
                            progress={Math.round(
                              (finalSpecificResults.length / csvIds.length) *
                              100,
                            )}
                            tone="highlight"
                            size="small"
                          />
                          <InlineStack align="space-between">
                            <Text as="span" variant="bodySm" tone="subdued">
                              {finalSpecificResults.length < csvIds.length
                                ? "In progress..."
                                : "Finalizing..."}
                            </Text>
                            <Text as="span" variant="bodySm" fontWeight="bold">
                              {Math.round(
                                (finalSpecificResults.length / csvIds.length) *
                                100,
                              )}
                              %
                            </Text>
                          </InlineStack>
                        </BlockStack>
                      )}

                      {/* Data Counter - Clean Minimalist Style */}
                      <Box
                        background="bg-surface-secondary"
                        padding="300"
                        borderRadius="200"
                      >
                        <InlineStack align="center">
                          <Text as="p" variant="bodySm" tone="subdued">
                            <strong>
                              {removalMode === "global"
                                ? globalResult.totalProcessed.toLocaleString()
                                : `${finalSpecificResults.length.toLocaleString()} / ${csvIds.length.toLocaleString()}`}
                            </strong>
                            {removalMode === "global"
                              ? " tags removed"
                              : " items processed"}
                          </Text>
                        </InlineStack>
                      </Box>
                    </BlockStack>
                  </Box>
                </BlockStack>
              </LegacyCard>
            )}

            {/* 6. Completion */}
            {(globalResult.complete || specificEnd) && !isRemoving && (
              <LegacyCard sectioned>
                <BlockStack align="center" inlineAlign="center" gap="500">
                  <Badge tone={globalResult.success ? "success" : "critical"}>
                    Operation Complete
                  </Badge>
                  <Text as="h2" variant="headingLg">
                    {removalMode === "global"
                      ? `Removed tags from ${globalResult.totalProcessed} items.`
                      : `Processed ${finalSpecificResults.length} items.`}
                  </Text>
                  <InlineStack gap="300">
                    <Button onClick={downloadResultCSV} variant="primary">
                      Download Results
                    </Button>
                    <Button onClick={resetAll}>Clear</Button>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            )}

            {/* 7. Live Logs */}
            {finalSpecificResults.length > 0 && (
              <LegacyCard>
                <div style={{ maxHeight: "250px", overflowY: "auto", overflowX: "hidden" }}>
                  <IndexTable
                    resourceName={{ singular: "result", plural: "results" }}
                    itemCount={finalSpecificResults.length}
                    headings={[
                      { title: "#" },
                      { title: "ID" },
                      { title: "Status" },
                      { title: "Error" },
                    ]}
                    selectable={false}
                    condensed={breakpoints.smDown}
                  >
                    {[...finalSpecificResults].reverse().map((r, i) => (
                      <IndexTable.Row key={i} id={i.toString()} position={i}>
                        <IndexTable.Cell>
                          {finalSpecificResults.length - i}
                        </IndexTable.Cell>
                        <IndexTable.Cell>{r.row}</IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge tone={r.success ? "success" : "critical"}>
                            {r.success ? "Success" : "Failed"}
                          </Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>{r.error || "-"}</IndexTable.Cell>
                      </IndexTable.Row>
                    ))}
                  </IndexTable>
                </div>
              </LegacyCard>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Confirm Removal"
        primaryAction={{
          content: "Yes, Remove Tags",
          onAction: handleRemoveConfirm,
          destructive: true,
        }}
        secondaryActions={[
          { content: "Cancel", onAction: () => setModalOpen(false) },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            Are you sure you want to remove {selectedTags.length} tag(s)?
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
