import { Page, Card, Layout, Select, Button, BlockStack, Text } from "@shopify/polaris";
import { useState, useEffect } from "react";
import { useFetcher, useOutletContext } from "react-router";
import { authenticate } from "../shopify.server"; // adjust 
import { EXPORT_RESOURCES } from "../graphql/exportQueries";
import { useLoaderData } from "react-router";
type AppOutletContext = {
  plan: "FREE" | "BASIC" | "ADVANCED";
};

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    query {
      metaobjectDefinitions(first: 100) {
        edges {
          node {
            type
            name
          }
        }
      }
    }
  `);

  const data = await response.json();

  const metaobjectTypes = data.data.metaobjectDefinitions.edges.map(
    (e) => ({
      label: e.node.name,
      value: e.node.type,
    })
  );

  return { metaobjectTypes };
};

const csvEscape = (value: any) => {
  if (value === null || value === undefined) return '""';
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
};

export const action = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const metaobjectType = formData.get("metaobjectType") as string;
  const resource = formData.get("resource") as string;
  const cursor = formData.get("cursor") as string | null;

  const config = EXPORT_RESOURCES[resource];
  if (!config) {
    return { error: "Unsupported resource" };
  }
  if (resource === "metaobject" && !metaobjectType) {
    return { error: "Metaobject type is required" };
  }

  const gqlQuery =
    resource === "metaobject"
      ? config.query({ type: metaobjectType })
      : config.query();

  const response = await admin.graphql(gqlQuery, { variables: { cursor } });
  const data = await response.json();
  const connection = config.getConnection(data);

  return {
    nodes: connection.edges.map((e: any) => e.node),
    pageInfo: connection.pageInfo,
    resource,
    metaobjectType
  };
};

export default function ExportData() {
  const fetcher = useFetcher();
  const { metaobjectTypes } = useLoaderData<typeof loader>();
  const { plan } = useOutletContext<AppOutletContext>();

  console.log(plan, "apiKey");
  const [resource, setResource] = useState("product");
  const [includeTags, setIncludeTags] = useState(true);
  const [includeMetafields, setIncludeMetafields] = useState(true);
  const [metaobjectType, setMetaobjectType] = useState("");

  const [isExporting, setIsExporting] = useState(false);
  const [accumulatedRecords, setAccumulatedRecords] = useState<any[]>([]);
  const [progressCount, setProgressCount] = useState(0);

  useEffect(() => {
    setIncludeTags(true);
    setIncludeMetafields(true);
    if (
      resource === "metaobject" &&
      metaobjectTypes?.length > 0 &&
      !metaobjectType
    ) {
      setMetaobjectType(metaobjectTypes[0].value);
    }
  }, [resource, metaobjectTypes]);

  const handleExport = () => {
    setIsExporting(true);
    setAccumulatedRecords([]);
    setProgressCount(0);

    // Start fetching first page
    const fd = new FormData();
    fd.append("resource", resource);
    if (resource === "metaobject") {
      fd.append("metaobjectType", metaobjectType);
    }
    fetcher.submit(fd, { method: "POST" });
  };

  // Handle Fetcher Response
  useEffect(() => {
    if (!isExporting || fetcher.state !== "idle" || !fetcher.data) return;

    if (fetcher.data.error) {
      console.error(fetcher.data.error);
      setIsExporting(false);
      // shopify.toast.show("Export failed");
      return;
    }

    const { nodes, pageInfo } = fetcher.data;

    // Append new records
    const newRecords = [...accumulatedRecords, ...nodes];
    setAccumulatedRecords(newRecords);
    setProgressCount(newRecords.length);

    if (pageInfo.hasNextPage) {
      // Fetch next page
      const fd = new FormData();
      fd.append("resource", resource);
      fd.append("cursor", pageInfo.endCursor);
      if (resource === "metaobject") {
        fd.append("metaobjectType", metaobjectType);
      }
      fetcher.submit(fd, { method: "POST" });
    } else {
      // Finished fetching, generate CSV
      finishExport(newRecords);
    }
  }, [fetcher.data, fetcher.state, isExporting]);

  const finishExport = (records: any[]) => {
    const config = EXPORT_RESOURCES[resource];
    const useTags = ["product", "customer", "order", "blog_post"].includes(resource) && includeTags;
    const useMetafields = resource !== "metaobject" && includeMetafields;

    /* -------- collect metafield columns -------- */
    const metafieldColumns = new Set<string>();
    if (useMetafields) {
      records.forEach((r) =>
        r.metafields?.edges.forEach((mf: any) =>
          metafieldColumns.add(`${mf.node.namespace}.${mf.node.key}`)
        )
      );
    }
    const mfCols = Array.from(metafieldColumns);

    /* -------- CSV -------- */
    const rows: string[] = [];
    rows.push([
      ...config.baseHeaders,
      ...(useTags ? ["tags"] : []),
      ...mfCols,
    ].join(","));

    records.forEach((r) => {
      const mfMap: Record<string, string> = {};
      r.metafields?.edges.forEach((mf: any) => {
        mfMap[`${mf.node.namespace}.${mf.node.key}`] = mf.node.value;
      });

      rows.push([
        ...config.buildBaseRow(r).map(csvEscape),
        ...(useTags ? [csvEscape(r.tags?.join(", ") || "")] : []),
        ...mfCols.map((k) => csvEscape(mfMap[k] || "")),
      ].join(","));
    });

    const csvContent = rows.join("\n");
    downloadCSV(csvContent);
    setIsExporting(false);
    // shopify.toast.show(`Export complete: ${records.length} records`);
  };

  const downloadCSV = (csv: string) => {
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${resource}-export.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Page title="Export Store Data" subtitle="Create CSV backups of your store resources before performing bulk updates.">
      <Layout>
        <Layout.Section>
          <Card sectioned>
            <BlockStack gap="400">
              <Text variant="headingMd">Select Data to Export</Text>

              <Select
                label="Resource"
                options={[
                  { label: "Products", value: "product" },
                  { label: "ProductVariant", value: "product_variant" },
                  { label: "Collections", value: "collection" },
                  { label: "Customers", value: "customer" },
                  { label: "Orders", value: "order" },
                  { label: "Company", value: "company" },
                  { label: "CompanyLocation", value: "company_location" },
                  { label: "Location", value: "location" },
                  { label: "Pages", value: "page" },
                  { label: "Blog", value: "blog" },
                  { label: "BlogPost", value: "blog_post" },
                  { label: "Market", value: "market" },
                  { label: "MetaObject", value: "metaobject" },
                ]}
                value={resource}
                onChange={setResource}
                disabled={isExporting}
              />

              {resource === "metaobject" && (
                <Select
                  label="Metaobject Type"
                  options={metaobjectTypes}
                  value={metaobjectType}
                  onChange={setMetaobjectType}
                  disabled={isExporting}
                />
              )}

              {["product", "customer", "order", "blog_post"].includes(resource) && (
                <Select
                  label="Include Tags"
                  options={[
                    { label: "Yes", value: "true" },
                    { label: "No", value: "false" },
                  ]}
                  value={String(includeTags)}
                  onChange={(v) => setIncludeTags(v === "true")}
                  disabled={isExporting}
                />
              )}

              {resource !== "metaobject" && (
                <Select
                  label="Include Metafields"
                  options={[
                    { label: "Yes", value: "true" },
                    { label: "No", value: "false" },
                  ]}
                  value={String(includeMetafields)}
                  onChange={(v) => setIncludeMetafields(v === "true")}
                  disabled={isExporting}
                />
              )}

              {isExporting && (
                <div style={{ padding: "10px", background: "#f4f6f8", borderRadius: "4px" }}>
                  <Text as="span" fontWeight="bold">Exporting... {progressCount} records fetched so far.</Text>
                </div>
              )}

              <Button
                variant="primary"
                loading={isExporting}
                onClick={handleExport}
                disabled={isExporting}
              >
                {isExporting ? "Exporting..." : "Export CSV"}
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

