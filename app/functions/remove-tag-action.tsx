async function fetchTagsPage(admin, objectType, cursor = null) {
  // ---------- PRODUCT TAGS ----------
  if (objectType === "product") {
    const res = await admin.graphql(
      `
      query ($after: String) {
        productTags(first: 1000, after: $after) {
          nodes
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      `,
      { variables: { after: cursor } },
    );

    const json = await res.json();
    const data = json.data.productTags;

    return {
      tags: data.nodes || [],
      hasNextPage: data.pageInfo.hasNextPage,
      nextCursor: data.pageInfo.endCursor,
    };
  }

  // ---------- CUSTOMER TAGS ----------
  if (objectType === "customer") {
    const res = await admin.graphql(
      `
      query ($after: String) {
        customers(first: 200, after: $after) {
          nodes {
            tags
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      `,
      { variables: { after: cursor } },
    );

    const json = await res.json();
    const customers = json.data.customers.nodes || [];

    return {
      tags: customers.flatMap((c) => c.tags || []),
      hasNextPage: json.data.customers.pageInfo.hasNextPage,
      nextCursor: json.data.customers.pageInfo.endCursor,
    };
  }

  // ---------- ORDER TAGS ----------
  if (objectType === "order") {
    const res = await admin.graphql(
      `
      query ($after: String) {
        orders(first: 100, after: $after) {
          nodes {
            tags
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      `,
      { variables: { after: cursor } },
    );

    const json = await res.json();
    const orders = json.data.orders.nodes || [];

    return {
      tags: orders.flatMap((o) => o.tags || []),
      hasNextPage: json.data.orders.pageInfo.hasNextPage,
      nextCursor: json.data.orders.pageInfo.endCursor,
    };
  }

  // ---------- ARTICLE TAGS ----------
  if (objectType === "article") {
    const res = await admin.graphql(
      `
      query ($after: String) {
        articles(first: 50, after: $after) {
          nodes {
            tags
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
      `,
      { variables: { after: cursor } },
    );

    const json = await res.json();
    const articles = json.data.articles.nodes || [];

    return {
      tags: articles.flatMap((a) => a.tags || []),
      hasNextPage: json.data.articles.pageInfo.hasNextPage,
      nextCursor: json.data.articles.pageInfo.endCursor,
    };
  }

  return {
    tags: [],
    hasNextPage: false,
    nextCursor: null,
  };
}
export async function handleFetch(admin, formData) {
  try {
    const objectType = formData.get("objectType");
    const cursor = formData.get("cursor") || null;

    if (!objectType) {
      return { error: "objectType is required" };
    }

    const page = await fetchTagsPage(admin, objectType, cursor);

    return {
      success: true,
      mode: "fetch",
      tags: page.tags,
      hasNextPage: page.hasNextPage,
      nextCursor: page.nextCursor,
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
    };
  }
}
/* ---------------- REMOVE TAGS GLOBALLY (MULTIPLE TAGS) ---------------- */
export async function handleRemoveFromAll(admin, formData) {
  try {
    console.log("=== START remove-global BATCH ===");

    const objectType = formData.get("objectType");
    const tags = JSON.parse(formData.get("tags") || "[]");
    const cursor = formData.get("cursor") || null;

    if (!tags.length) {
      return { success: false, error: "No tags provided" };
    }

    console.log("Cursor received:", cursor);
    console.log("Object Type:", objectType);
    console.log("Tags:", tags);

    const tagQuery = tags.map((t) => `tag:${t}`).join(" OR ");

    // Fetch ONE PAGE only
    const query = `
      {
        ${objectType}s(
          first: 20,
          after: ${cursor ? `"${cursor}"` : null},
          query: "${tagQuery}"
        ) {
          edges {
            cursor
            node { id tags }
          }
          pageInfo { hasNextPage }
        }
      }
    `;

    const res = await admin.graphql(query);
    const json = await res.json();

    const data = json?.data?.[`${objectType}s`];
    if (!data) {
      return { success: false, error: "No data returned from Shopify." };
    }

    const edges = data.edges || [];
    const items = edges.map((e) => e.node);
    const hasNextPage = data.pageInfo.hasNextPage;
    const nextCursor = hasNextPage ? edges.at(-1)?.cursor : null;

    const results = [];
    const mutation = `
      mutation removeTags($id: ID!, $tags: [String!]!) {
        tagsRemove(id: $id, tags: $tags) {
          userErrors { message }
        }
      }
    `;

    for (const item of items) {
      const existing = item.tags || [];
      const tagsToRemove = tags.filter((t) => existing.includes(t));
      const missingTags = tags.filter((t) => !existing.includes(t));

      if (!tagsToRemove.length) {
        results.push({
          id: item.id,
          removedTags: [],
          success: false,
          error: `Tags not present: ${missingTags.join(", ")}`,
        });
        continue;
      }

      try {
        const response = await admin.graphql(mutation, {
          variables: { id: item.id, tags: tagsToRemove },
        });
        const j = await response.json();

        const errors = j?.data?.tagsRemove?.userErrors;

        if (errors?.length) {
          results.push({
            id: item.id,
            removedTags: [],
            success: false,
            error: errors.map((e) => e.message).join(", "),
          });
        } else {
          results.push({
            id: item.id,
            removedTags: tagsToRemove,
            success: true,
            error: missingTags.length
              ? `Missing tags: ${missingTags.join(", ")}`
              : null,
          });
        }
      } catch (err) {
        results.push({
          id: item.id,
          removedTags: [],
          success: false,
          error: err.message,
        });
      }
    }

    console.log("Returning page results...");
    return {
      mode: "remove-global",
      success: true,
      results,
      hasNextPage,
      nextCursor,
      totalProcessed: results.length,
    };
  } catch (err) {
    console.log("ERROR in remove-global:", err);
    return { success: false, error: err.message };
  }
}

export async function handleRemoveSpecific(admin, formData) {
  const tags = JSON.parse(formData.get("tags") || []);
  const row = JSON.parse(formData.get("row") || []);
  const flag = JSON.parse(formData.get("flag") || false);
  const resourceType = JSON.parse(formData.get("resource"));
  let cleanId = "";

  if (!flag) {
    const res = await fetchResourceId(admin, resourceType, row);
    cleanId = res;
  } else {
    cleanId = row;
  }

  // ⛔ EARLY EXIT if ID is missing or invalid
  if (!cleanId) {
    return {
      mode: "remove-specific",
      success: false,
      results: [
        {
          id: row,
          removedTags: [],
          success: false,
          error: flag
            ? "Invalid or empty resource ID provided"
            : `Failed to fetch ${resourceType} ID`,
        },
      ],
    };
  }

  const results = [];

  const getTagsQuery = `
    query GetTags($id: ID!) {
      node(id: $id) {
        ... on Product { tags }
        ... on Customer { tags }
        ... on Order { tags }
        ... on Article { tags }
      }
    }
  `;

  const removeMutation = `
    mutation removeTags($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) {
        userErrors { message }
      }
    }
  `;

  try {
    // Fetch existing tags
    const existingRes = await admin.graphql(getTagsQuery, {
      variables: { id: cleanId },
    });
    const existingJson = await existingRes.json();
    const existingTags = existingJson?.data?.node?.tags || [];

    // Determine which tags exist and which don't
    const tagsToRemove = tags.filter((t) => existingTags.includes(t));
    const missingTags = tags.filter((t) => !existingTags.includes(t));

    // Case 1: No tag exists → do NOT run mutation
    if (tagsToRemove.length === 0) {
      results.push({
        id: cleanId,
        removedTags: [],
        success: false,
        error: `Tags not present: ${missingTags.join(", ")}`,
      });

      return {
        mode: "remove-specific",
        success: false,
        results,
      };
    }

    // Case 2: Some or all exist → remove only existing ones
    const removeRes = await admin.graphql(removeMutation, {
      variables: { id: cleanId, tags: tagsToRemove },
    });

    const removeJson = await removeRes.json();
    console.log(JSON.stringify(removeJson, null, 2), ".......removejson");
    const userErrors = removeJson?.data?.tagsRemove?.userErrors;

    if (userErrors?.length) {
      // Shopify errors
      results.push({
        id: cleanId,
        removedTags: [],
        success: false,
        error: userErrors.map((e) => e.message).join(", "),
      });
    } else {
      // Successful removal
      results.push({
        id: cleanId,
        removedTags: tagsToRemove,
        success: true,
        error: missingTags.length
          ? `Missing tags: ${missingTags.join(", ")}`
          : null,
      });
    }
  } catch (err) {
    results.push({
      id: cleanId,
      removedTags: [],
      success: false,
      error: err.message,
    });
  }

  return {
    mode: "remove-specific",
    success: results.every((r) => r.success),
    results,
  };
}

export async function fetchResourceId(admin, resourceType, value) {
  const queries = {
    customer: {
      query: `query($value: String!) {
        customers(first: 1, query: $value) {
          edges { node { id } }
        }
      }`,
      buildQuery: (v) => `email:${v}`,
      path: (res) => res?.customers?.edges?.[0]?.node?.id,
    },

    order: {
      query: `query($value: String!) {
        orders(first: 1, query: $value) {
          edges { node { id } }
        }
      }`,
      buildQuery: (v) => `name:${v}`,
      path: (res) => res?.orders?.edges?.[0]?.node?.id,
    },

    article: {
      query: `query($value: String!) {
        articles(first: 1, query: $value) {
          edges { node { id } }
        }
      }`,
      buildQuery: (v) => `handle:${v}`,
      path: (res) => res?.articles?.edges?.[0]?.node?.id,
    },

    product: {
      query: `query($value: String!) {
    productVariants(first: 1, query: $value) {
      edges {
        node {
          product { id }
        }
      }
    }
  }`,
      buildQuery: (v) => `sku:${v}`,
      path: (res) => res?.productVariants?.edges?.[0]?.node?.product?.id,
    },
  };
  let type = resourceType === "blogPost" ? "article" : resourceType;
  const config = queries[type];
  if (!config) {
    console.error("Unsupported resource type:", resourceType);
    throw new Error(`Unsupported resource type: ${resourceType}`);
  }
  const builtValue = config.buildQuery(value);
  const variables = { value: builtValue };

  // Execute GraphQL request
  const response = await admin.graphql(config.query, { variables });
  const json = await response.json();
  // Extract ID
  const extractedId = config.path(json.data) || null;

  return extractedId;
}
