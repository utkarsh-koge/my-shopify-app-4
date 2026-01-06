import { authenticate } from "../shopify.server";
import type { LoaderFunctionArgs } from "react-router";

const METAOBJECT_TYPE = "__tag_metafield_app_database";

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const direction = url.searchParams.get("direction") || "next"; // "next" or "prev"
    const limit = 10;

    // Check if definition exists
    const definitionQuery = `
      query metaobjectDefinitionExistsByType($type: String!) {
        metaobjectDefinitionByType(type: $type) {
          id
        }
      }
    `;

    const defRes = await admin.graphql(definitionQuery, {
      variables: { type: METAOBJECT_TYPE },
    });

    const defJson = await defRes.json();
    const definitionExists = !!defJson?.data?.metaobjectDefinitionByType;

    if (!definitionExists) {
      return {
        success: false,
        database: [],
        pageInfo: { hasNextPage: false, hasPreviousPage: false },
        error: `Metaobject definition "${METAOBJECT_TYPE}" does not exist`,
      };
    }

    // Construct Pagination Arguments
    let paginationArgs = "";
    if (direction === "prev" && cursor) {
      paginationArgs = `last: ${limit}, before: "${cursor}"`;
    } else if (cursor) {
      paginationArgs = `first: ${limit}, after: "${cursor}"`;
    } else {
      paginationArgs = `first: ${limit}`;
    }

    const query = `
      query GetTagMetafieldDB {
        metaobjects(type: "${METAOBJECT_TYPE}", ${paginationArgs}, reverse: true) {
          pageInfo {
            hasNextPage
            hasPreviousPage
            startCursor
            endCursor
          }
          nodes {
            id
            handle
            fields {
              key
              value
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query);
    const data = await response.json();

    if ((data as any).errors) {
      console.error("GraphQL errors:", (data as any).errors);
      return {
        success: false,
        error: "GraphQL error while fetching metaobjects",
      };
    }

    const nodes = data?.data?.metaobjects?.nodes || [];
    const pageInfo = data?.data?.metaobjects?.pageInfo || {
      hasNextPage: false,
      hasPreviousPage: false,
      startCursor: null,
      endCursor: null,
    };

    const formatted = nodes.map((obj: any) => {
      const fieldMap = Object.fromEntries(
        obj.fields.map((f: any) => [f.key, f.value]),
      );

      return {
        id: obj.id,
        userName: fieldMap.username || "unknown",
        operation: fieldMap.operation || "",
        objectType: fieldMap.objecttype || "",
        value: fieldMap.value ? JSON.parse(fieldMap.value) : [],
        restore: fieldMap.restore === "true",
        time: fieldMap.time || null,
      };
    });

    return {
      success: true,
      database: formatted,
      pageInfo,
    };

  } catch (error: any) {
    console.error("Fetch Metaobject DB error:", error);
    return {
      success: false,
      error: "Failed to fetch metaobject database",
    };
  }
}
