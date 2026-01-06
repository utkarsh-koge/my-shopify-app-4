import { useState, useCallback, useEffect } from "react";
import { useFetcher, useNavigate, useOutletContext } from "react-router";
import Papa from "papaparse";
import { authenticate } from "../shopify.server";
import {
  Page,
  Layout,
  LegacyCard,
  FormLayout,
  Select,
  TextField,
  Button,
  Banner,
  BlockStack,
  DropZone,
  IndexTable,
  Text,
  Badge,
  InlineStack,
  ProgressBar,
  Modal,
  EmptyState,
  Tag,
  ChoiceList,
} from "@shopify/polaris";
import type { LoaderFunctionArgs } from "react-router";
import { fetchResourceId } from "app/functions/remove-tag-action";

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
async function fetchAllTagsByResource(admin, id) {
  const query = `
    query getResourceTags($id: ID!) {
      node(id: $id) {
        __typename
        ... on Product { tags }
        ... on Customer { tags }
        ... on Order { tags }
        ... on Article { tags }
      }
    }
  `;

  const res = await admin.graphql(query, { variables: { id } });
  const json = await res.json();

  const node = json?.data?.node;
  if (!node) return [];

  return Array.isArray(node.tags) ? node.tags : [];
}


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

    const results = [];
    const mutation = `
      mutation tagOp($id: ID!, $tags: [String!]!) {
        tagsAdd(id: $id, tags: $tags) {
          userErrors { field message }
        }
      } 
    `;

    const normalizeTag = (tag) =>
      typeof tag === "string" ? tag.trim().toLowerCase() : tag;

    for (const row of rows) {
      let resourceId = row.id;

      if (!flag) {
        const fetchedId = await fetchResourceId(admin, resourceType, resourceId);
        if (!fetchedId) {
          results.push({
            id: row.id,
            success: false,
            errors: [{ message: `Failed to fetch ${resourceType} ID` }],
          });
          continue;
        }
        resourceId = fetchedId;
      }

      const existingTags = await fetchAllTagsByResource(admin, resourceId);

      const normalizedExisting = existingTags.map(normalizeTag);

      const alreadyPresent = row.tags.filter(tag =>
        normalizedExisting.includes(normalizeTag(tag))
      );

      const missingTags = row.tags.filter(tag =>
        !normalizedExisting.includes(normalizeTag(tag))
      );

      if (missingTags.length === 0) {
        results.push({
          id: row.id,
          success: false,
          errors: [{
            message: "All tags already exist",
            existingTags: alreadyPresent,
          }],
        });
        continue;
      }
      try {
        const res = await admin.graphql(mutation, {
          variables: {
            id: resourceId,
            tags: missingTags.map(t => t.trim()),
          },
        });

        const parsed = await res.json();
        const errors = parsed?.data?.tagsAdd?.userErrors || [];

        results.push({
          id: row.id,
          success: errors.length === 0,
          errors: alreadyPresent.length
            ? [{
              message: "Some tags already existed",
              existingTags: alreadyPresent,
            }]
            : errors,
        });
      } catch (err) {
        results.push({
          id: row.id,
          success: false,
          errors: [{ message: err.message || "Unknown error" }],
        });
      }
    }

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
  const navigate = useNavigate();
  const { planData } = useOutletContext<AppOutletContext>();
  console.log(planData, '.........plannnnnnnnnn')
  // State
  const [objectType, setObjectType] = useState("product");
  const [csvData, setCsvData] = useState<{ id: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [progress, setProgress] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [csvType, setCsvType] = useState("Id");
  const [specificField, setSpecificField] = useState("Id");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  let plan = planData?.plan || 'FREE';
  // Modals
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
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

  const isFinished = progress === 100 && !isRunning;

  const updateTagLimit = (tagAddCsvCount: number, planData: any) => {
    fetcher.submit(
      {
        plan: planData?.plan, // or pass dynamically if needed
        updates: {
          tagAddCsvLimit: planData?.limits?.tagAddCsvLimit - tagAddCsvCount,
          tagAdd: planData?.limits?.tagAdd - 1,
        },
      },
      {
        method: "POST",
        encType: "application/json",
        action: "/api/update/plan",
      }
    );
  };

  // Effects
  useEffect(() => {
    if (!isRunning) return;
    // Only process when the fetcher is back to idle and has data
    if (fetcher.state !== "idle" || !fetcher.data?.results) return;
    const result = fetcher.data.results[0];
    const processingIndex = currentIndex;
    const rowId = csvData[processingIndex]?.id;
    if (result.id !== rowId) return;
    setResults((prev) => {
      if (prev.length > processingIndex) return prev;
      return [{ ...result, index: processingIndex }, ...prev];
    });

    const nextIndex = processingIndex + 1;
    setProgress(Math.round((nextIndex / csvData.length) * 100));

    // Update current index for UI
    setCurrentIndex(nextIndex);

    if (nextIndex < csvData.length) {
      sendRow(nextIndex);
    } else {
      setIsRunning(false);
    }
  }, [fetcher.state, fetcher.data, isRunning, results.length, csvData]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isRunning) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isRunning]);

  useEffect(() => {
    // Reset state on object type change
    setCsvData([]);
    setResults([]);
    setProgress(0);
    setTags([]);
    setTagInput("");
    setSpecificField("Id");
    setFile(null);

    // Set default CSV type
    if (objectType === "product") setCsvType("Sku");
    if (objectType === "customer") setCsvType("Email");
    if (objectType === "order") setCsvType("Name");
    if (objectType === "blogPost") setCsvType("Handle");
  }, [objectType]);

  useEffect(() => {
    setCsvData([]);
    setFile(null);
    setWarning(prev => ({ ...prev, active: false }))
    setAlert(prev => ({ ...prev, active: false }))
  }, [specificField, csvType]);

  useEffect(() => {
    if (!isRunning && progress === 100) {
      const successResults = results.filter((r) => r.success === true);

      if (successResults.length > 0) {
        const rows = successResults.map((r) => ({
          id: r.id ?? "",
          tagList: Array.isArray(tags) ? tags.join(", ") : "",
          success: true,
          error: "",
        }));

        const Data = {
          operation: "Tags-Added",  // only operation
          objectType,               // only objectType
          value: rows,              // only value
        };

        if (plan !== 'ADVANCED') { updateTagLimit(rows.length, planData); }

        fetch("/api/add/db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Data),
        }).catch((err) => console.error("Logging error", err));
      }
    }
  }, [progress, isRunning]);

  function getShopifyObjectTypeFromGid(gid: string): string | null {
    if (typeof gid !== "string") return null;
    const match = gid.match(/^gid:\/\/shopify\/([^/]+)\/\d+$/);
    return match ? match[1].toLowerCase() : null;
  }

  const handleCsvInput = useCallback((_dropFiles: File[], acceptedFiles: File[], _rejectedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => {
        const normalizedField = specificField.toLowerCase();
        let hasError = false;
        console.log('Parsed CSV Data:', normalizedField);
        const rows = res.data
          .map((row: any) => {
            const normalizedRow = Object.keys(row).reduce((acc: any, key) => {
              acc[key.toLowerCase()] = row[key];
              return acc;
            }, {});

            const value = normalizedRow[normalizedField];
            const id = typeof value === "string" ? value.trim() : value;
            if (!id) return null;
            const type = objectType === 'blogPost' ? 'article' : objectType;
            const gidObjectType = getShopifyObjectTypeFromGid(id);
            if (gidObjectType && gidObjectType !== type.toLowerCase()) {
              setAlert({
                active: true,
                title: "Invalid Shopify ID",
                message: `The CSV contains an ID of type "${gidObjectType}", but "${objectType}" was selected.\n\nID: ${id}`,
                tone: 'critical'
              });
              setWarning(prev => ({ ...prev, active: false }))

              hasError = true;
              return null;
            }
            return { id };
          })
          .filter(Boolean);

        if (hasError) return;

        if (rows.length > 5000) {
          setAlert({
            active: true,
            title: "Limit Exceeded",
            message: "Only 5000 records will add at a time",
            tone: 'critical'
          })
          setWarning(prev => ({ ...prev, active: false }))
          return;
        }

        if (rows.length > planData?.limits?.tagAddCsvLimit && plan !== "ADVANCED") {
          setWarning({
            active: true,
            title: "Limit Exceeded",
            message: `You only have ${planData?.limits?.tagAddCsvLimit} records remaining according to your plan. Please update your plan to add more.`,
            tone: "warning",
          });
          setAlert(prev => ({ ...prev, active: false }))

          return;
        }

        if (rows.length === 0) {
          setAlert({
            active: true,
            title: "Valid Record Not Found",
            message: "No valid records found in the CSV file. Please follow the CSV Format",
            tone: 'critical'
          });
          setWarning(prev => ({ ...prev, active: false }))
          return;
        }

        setFile(file);
        setCsvData(rows as { id: string }[]);
        setProgress(0);
        setResults([]);
        setAlert(prev => ({ ...prev, active: false }))
        setWarning(prev => ({ ...prev, active: false }))
      },
    });
  }, [specificField, objectType, planData]);

  const handleTagAdd = useCallback(() => {
    const trimmed = tagInput.trim();

    if (planData?.limits?.tagAdd === 0 && plan !== 'ADVANCED') {
      setWarning({
        active: true,
        title: "Limit Exceeded",
        message: "Your tag add limit has been reached. Please upgrade your plan to continue.",
        tone: "warning",
      });
      setAlert(prev => ({ ...prev, active: false }))
      return;
    }

    if (trimmed.length < 2) {
      setAlert({
        active: true,
        title: "Minimum Tag Length",
        message: "A tag must contain at least 2 characters.",
        tone: "critical",
      });
      setWarning(prev => ({ ...prev, active: false }))
      return;
    }

    // if (trimmed.length < 2) return;
    if (tags.includes(trimmed)) {
      setAlert({
        active: true,
        title: "Duplicate Tag",
        message: `The tag "${trimmed}" is already added.`,
        tone: "critical",
      });
      setWarning(prev => ({ ...prev, active: false }))
      return;
    }
    setTags((current) => [...current, trimmed]);
    setTagInput("");
    setAlert((prev) => ({ ...prev, active: false }));
  }, [tagInput, tags]);

  const handleTagRemove = useCallback((tagToRemove: string) => {
    setTags((current) => current.filter((t) => t !== tagToRemove));
  }, []);

  const sendRow = (index: number) => {
    const row = csvData[index];
    if (!row) return;

    const fd = new FormData();
    fd.append("objectType", objectType === 'blogPost' ? 'article' : objectType);
    fd.append("flag", JSON.stringify(specificField === "Id"));
    fd.append("rows", JSON.stringify([{ id: row.id, tags }]));

    fetcher.submit(fd, { method: "POST" });
  };

  const handleRun = () => {
    setConfirmModalOpen(false);
    if (!csvData.length || !tags.length) return;
    setResults([]);
    setProgress(0);
    setCurrentIndex(0);
    setIsRunning(true);
    sendRow(0);
  };

  const downloadResults = () => {
    if (!results.length) return;

    const header = [specificField, "Tags", "Success", "Error"].join(",") + "\n";

    const escapeCSV = (value: any) =>
      `"${String(value ?? "").replace(/"/g, '""')}"`;
    console.log('Downloading results with tags:', results);
    const rows = results.map((r) => {
      const id = r.id ?? "";

      // ✅ Prefer row-level tags if present, fallback to global tags
      const tagList =
        Array.isArray((r as any).tags)
          ? (r as any).tags.join(", ")
          : Array.isArray(tags)
            ? tags.join(", ")
            : "";

      const success = r.success ? "true" : "false";

      const error =
        Array.isArray(r.errors) && r.errors.length > 0
          ? Array.from(
            new Set(
              r.errors.map((e: any) => {
                if (Array.isArray(e.existingTags) && e.existingTags.length > 0) {
                  return `${e.message}: ${e.existingTags.join(", ")}`;
                }
                return e.message;
              })
            )
          ).join("; ")
          : "";

      return [
        escapeCSV(id),
        escapeCSV(tagList),
        escapeCSV(success),
        escapeCSV(error),
      ].join(",");
    });

    const csvContent = header + rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `tag_manager_results-${Date.now()}.csv`;
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTemplate = () => {
    const header = specificField === "Id" ? "Id" : csvType;
    let sampleValues: string[] = [];
    if (header === "Id") sampleValues = [`gid://shopify/${objectType === 'blogPost' ? 'Article' : objectType.charAt(0).toUpperCase() + objectType.slice(1)}/123456789`];
    else if (header === "Sku") sampleValues = ["SKU-1"];
    else if (header === "Email") sampleValues = ["example@mail.com"];
    else if (header === "Name") sampleValues = ["#1001"];
    else if (header === "Handle") sampleValues = ["handle-1"];

    const csvContent = [header, ...sampleValues].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sample-${header}-template.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const resetAll = () => {
    setCsvData([]);
    setResults([]);
    setProgress(0);
    setTags([]);
    setTagInput("");
    setSpecificField("Id");
    setFile(null);
    setAlert(prev => ({ ...prev, active: false }))
    setWarning(prev => ({ ...prev, active: false }))
  }

  const resourceOptions = [
    { label: "Products", value: "product" },
    { label: "Customers", value: "customer" },
    { label: "Orders", value: "order" },
    { label: "Blog Posts", value: "blogPost" },
  ];

  const matchOptions = [
    { label: "Shopify GID", value: "Id" },
    { label: csvType, value: csvType },
  ];
  function goToHome() {
    if (!isRunning) navigate("/app");
  }
  return (
    <Page
      title="Add Tags"
      subtitle="Search for tags and add them from specific items."
      backAction={{ content: "Home", onAction: goToHome }}
    >

      <Layout>
        <Layout.Section variant="oneThird">
          <BlockStack gap="500">
            <LegacyCard title="Configuration" sectioned>
              <Select
                label="Resource Type"
                options={resourceOptions}
                onChange={setObjectType}
                value={objectType}
                disabled={isRunning || csvData.length > 0}
              />
            </LegacyCard>

            <LegacyCard title="Add Tags" sectioned>
              <form onSubmit={(e) => { e.preventDefault(); handleTagAdd(); }}>
                <FormLayout>
                  <TextField
                    label="Enter Tags"
                    value={tagInput}
                    onChange={setTagInput}
                    autoComplete="off"
                    placeholder="Enter tag (Min 2 chars)"
                    connectedRight={
                      <Button onClick={handleTagAdd} disabled={!tagInput.trim()}>Add</Button>
                    }
                    disabled={isRunning || csvData.length > 0}
                    helpText="Press enter or click Add"
                  />
                  {tags.length > 0 && (
                    <InlineStack gap="200" wrap>
                      {tags.map(tag => (
                        <div key={tag}>
                          <Tag onRemove={() => !isRunning && handleTagRemove(tag)} disabled={isRunning || csvData.length > 0}>
                            {tag}
                          </Tag>
                        </div>
                      ))}
                    </InlineStack>
                  )}
                  {tags.length > 0 && !isRunning && !isFinished && (
                    <Button variant="plain" tone="critical" onClick={resetAll}>Clear All Tags</Button>
                  )}
                </FormLayout>
              </form>
            </LegacyCard>
          </BlockStack>
        </Layout.Section>

        <Layout.Section>
          <BlockStack gap="500">
            {alert.active && (
              <Banner
                title={alert.title}
                tone={alert.tone}
                onDismiss={() => setAlert(prev => ({ ...prev, active: false }))}
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
            {tags.length === 0 && !isFinished && (
              <LegacyCard sectioned>
                <EmptyState
                  heading="Ready to Add Tags"
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Enter tags on the left to begin configuring your bulk update.</p>
                </EmptyState>
              </LegacyCard>
            )}

            {tags.length > 0 && !isFinished && (
              <LegacyCard title="Import Data" sectioned>
                <BlockStack gap="400">
                  <BlockStack gap="200">
                    <ChoiceList
                      title="Match resources by"
                      choices={matchOptions}
                      selected={[specificField]}
                      onChange={(val) => setSpecificField(val[0])}
                      disabled={isRunning}
                    />
                    <Button variant="plain" onClick={handleDownloadTemplate} disabled={isRunning}>Download Sample CSV</Button>
                  </BlockStack>

                  <DropZone onDrop={handleCsvInput} accept=".csv" allowMultiple={false} disabled={isRunning}>
                    {file ? (
                      <DropZone.FileUpload actionTitle="Replace file" />
                    ) : <DropZone.FileUpload actionTitle="Add file" />}
                  </DropZone>
                  {file && (
                    <Text as="p" tone="success">
                      {file.name} — {csvData.length} records loaded. <Button variant="plain" onClick={() => { setFile(null); setCsvData([]); }} disabled={isRunning}>Remove</Button>
                    </Text>
                  )}

                  {plan === "ADVANCED" && <Text as="p" tone="subdued">Only 5000 records will add at a time</Text>}

                  {isRunning && (
                    <BlockStack gap="200">
                      <ProgressBar progress={progress} tone="primary" />
                      <Text as="p" tone="subdued" alignment="center">{progress}%</Text>
                    </BlockStack>
                  )}

                  <Button
                    variant="primary"
                    onClick={() => setConfirmModalOpen(true)}
                    disabled={!csvData.length || isRunning}
                    loading={isRunning}
                    fullWidth
                  >
                    {isRunning ? "Processing..." : "Run Bulk Update"}
                  </Button>
                </BlockStack>
              </LegacyCard>
            )}

            {isFinished && (
              <LegacyCard sectioned>
                <BlockStack align="center" inlineAlign="center" gap="500">
                  <Badge tone="success" size="large">Operation Complete</Badge>
                  <Text as="h2" variant="headingLg">Successfully processed {results.length} items.</Text>
                  <InlineStack gap="300">
                    <Button onClick={downloadResults} variant="primary">Download Results</Button>
                    <Button onClick={resetAll}>Clear</Button>
                  </InlineStack>
                </BlockStack>
              </LegacyCard>
            )}

            {results.length > 0 && (
              <LegacyCard>
                <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
                  <IndexTable
                    resourceName={{ singular: 'result', plural: 'results' }}
                    itemCount={results.length}
                    headings={[
                      { title: '#' },
                      { title: 'ID' },
                      { title: 'Status' },
                      { title: 'Error' }
                    ]}
                    selectable={false}
                  >
                    {results.map(({ id, success, errors, index }, i) => (
                      <IndexTable.Row id={id || i.toString()} key={i} position={i}>
                        <IndexTable.Cell>{(index ?? 0) + 1}</IndexTable.Cell>
                        <IndexTable.Cell>{id}</IndexTable.Cell>
                        <IndexTable.Cell>
                          <Badge tone={success ? 'success' : 'critical'}>{success ? 'Success' : 'Failed'}</Badge>
                        </IndexTable.Cell>
                        <IndexTable.Cell>
                          {errors && errors.length > 0 ? errors.map(e => e.message).join(', ') : '-'}
                        </IndexTable.Cell>
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
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        title="Ready to Add Tags?"
        primaryAction={{
          content: 'Add Tags',
          onAction: handleRun,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: () => setConfirmModalOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <Text as="p">
            You are about to add {tags.length} tag(s) to {csvData.length} resource(s) from your CSV.
            This process will run in the background.
          </Text>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

