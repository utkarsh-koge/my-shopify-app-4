export const queryMap = {
  product: "products",
  variant: "productVariants",
  collection: "collections",
  customer: "customers",
  order: "orders",
  company: "companies",
  companyLocation: "companyLocations",
  location: "locations",
  page: "pages",
  blog: "blog",
  blogPost: "articles",
  market: "markets",
};

export function fail(message, error = null) {
  return { ok: false, message, error };
}

export function success(data) {
  return { ok: true, ...data };
}

export async function fetchResourceCount(admin, resource) {
  const countQueryMap = {
    products: "productsCount",
    productVariants: "productVariantsCount",
    collections: "collectionsCount",
    customers: "customersCount",
    orders: "ordersCount",
    draftOrder: "draftOrdersCount",
    companies: "companiesCount",
    companyLocations: "companyLocationsCount",
    locations: "locationsCount",
    pages: "pagesCount",
    blog: "blogsCount",
    articles: "articlesCount",
    markets: "marketsCount",
    shop: null, // shop has no count
  };

  const countField = countQueryMap[resource];

  console.log(`➡️ Count field mapped to: ${countField}`);

  if (!countField) {
    return { count: 0 };
  }

  const query = `
    query {
      ${countField} {
        count
      }
    }
  `;

  try {
    const res = await admin.graphql(query);
    if (!res) {
      return { count: 0 };
    }
    const json = await res.json();
    const count = json?.data?.[countField]?.count ?? 0;
    return { count };
  } catch (error) {
    console.error(error);
    return { count: 0 };
  }
}

/* ------------------ FETCH ONE PAGE OF RESOURCE ITEMS ------------------ */
export async function fetchAllItemIds(admin, resource, cursor = null) {

  const count = await fetchResourceCount(admin, resource);

  const query = `
    query ($cursor: String) {
      ${resource}(first: 50, after: $cursor) {
        edges {
          cursor
          node { id }
        }
        pageInfo { hasNextPage }
      }
    }
  `;

  const res = await admin.graphql(query, { variables: { cursor } });
  const json = await res.json();
  const data = json?.data?.[resource];

  // 🛑 No data?
  if (!data) {
    console.log("❌ No data returned from Shopify.");
    return {
      items: [],
      nextCursor: null,
      hasMore: false,
    };
  }

  const edges = data.edges;
  const items = edges.map((e) => e.node);
  const hasMore = data.pageInfo.hasNextPage;
  const nextCursor = hasMore ? edges.at(-1).cursor : null;
  return {
    items,
    nextCursor,
    hasMore,
    count,
  };
}

/* ------------------ REMOVE ALL METAFIELDS IN PAGES OF 200 ------------------ */
export async function removeAllMetafields(
  admin,
  resource,
  namespace,
  key,
  cursor = null,
) {
  const page = await fetchAllItemIds(admin, resource, cursor);
  console.log(`➡️ Using count:`, page?.count?.count);

  const metafields = page.items.map((item) => ({
    ownerId: item.id,
    namespace,
    key,
  }));

  const batchResults = await deleteMetafields(admin, metafields);

  return {
    results: batchResults, // delete results for this batch (200 max)
    nextCursor: page.nextCursor, // cursor or null
    hasMore: page.hasMore,
    ResourceCount: page?.count?.count, // true if more pages exist
  };
}

/* ------------------ REMOVE SPECIFIC METAFIELD ------------------ */
export async function removeSpecificMetafield(
  admin,
  id,
  namespace,
  key,
  flag,
  objectType,
) {
  // Normalize flag ALWAYS
  flag = String(flag).toLowerCase() === "true";
  console.log("Normalized flag:", flag);

  let ownerId = id;

  if (!flag) {
    console.log("Flag FALSE → resolving ID...");
    const res = await fetchResourceId(admin, objectType, id);

    if (!res) {
      return {
        id,
        success: false,
        errors: `Could not resolve ID for: ${id}`,
        data: null,
      };
    }

    ownerId = res;
  }

  let metafields = [{ ownerId, namespace, key }];
  const result = await deleteMetafields(admin, metafields);

  return {
    id: ownerId,
    success: result[0].success,
    data: result[0].data,
    errors: result[0].errors,
  };
}

export function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export async function deleteMetafields(admin, metafields) {
  const results = [];

  // 1️⃣ UNIVERSAL CHECK QUERY (works for all resource types)
  const checkQuery = `
    query ($ownerId: ID!, $namespace: String!, $key: String!) {
      node(id: $ownerId) {
        ... on HasMetafields {
          metafield(namespace: $namespace, key: $key) {
            id
            namespace
            key
            type
            value
          }
        }
      }
    }
  `;

  // 2️⃣ DELETE MUTATION
  const deleteQuery = `
    mutation ($metafields: [MetafieldIdentifierInput!]!) {
      metafieldsDelete(metafields: $metafields) {
        deletedMetafields { ownerId namespace key }
        userErrors { field message }
      }
    }
  `;

  // 3️⃣ PROCESS EACH METAFIELD
  for (const mf of metafields) {
    const { ownerId, namespace, key } = mf;

    // 🟦 STEP A — CHECK IF METAFIELD EXISTS
    const checkRes = await admin.graphql(checkQuery, {
      variables: { ownerId, namespace, key },
    });

    const checkJson = await checkRes.json();
    const found = checkJson?.data?.node?.metafield ?? null;

    // 🟥 If metafield NOT found → return failure (no delete)
    if (!found) {
      results.push({
        id: ownerId,
        success: false,
        errors: "Metafield is not present",
        data: null,
      });
      continue;
    }

    // 🟩 Build the `data` object for the result
    const data = {
      ownerId,
      namespace,
      key,
      metafieldId: found.id,
      type: found.type,
      value: found.value,
    };

    // 🟦 STEP B — DELETE THE METAFIELD
    const deleteRes = await admin.graphql(deleteQuery, {
      variables: { metafields: [{ ownerId, namespace, key }] },
    });

    const deleteJson = await deleteRes.json();
    const deleted = deleteJson?.data?.metafieldsDelete?.deletedMetafields ?? [];
    const userErrors = deleteJson?.data?.metafieldsDelete?.userErrors ?? [];

    const success = deleted[0] !== null;
    const error = success ? null : userErrors?.[0]?.message || "Failed";

    // 🟩 Add final result
    results.push({
      id: ownerId,
      success,
      errors: error,
      data,
    });
  }
  console.log("🗑️ DELETE RESULTS:", results);
  return results;
}

/* ------------------ FETCH DEFINITIONS / VALUES ------------------ */
export async function fetchDefinitions(admin, resource) {
  if (resource === "blog") return await fetchBlogMeta(admin);
  if (resource === "article") return await fetchArticleMeta(admin);
  return await fetchGenericMeta(admin, resource);
}

/********** BLOG **********/
export async function fetchBlogMeta(admin) {
  // 1. Fetch first blog ID
  const first = await admin.graphql(`
    query {
      blogs(first: 1) {
        edges { node { id } }
      }
    }
  `);

  const b = await first.json();
  const blogId = b?.data?.blogs?.edges?.[0]?.node?.id;
  if (!blogId) return fail("No blog found");

  // 2. Pagination setup
  let allMetafields = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = `
      query ($blogId: ID!, $cursor: String) {
        blog(id: $blogId) {
          id
          metafieldDefinitions(first: 200, after: $cursor) {
            edges {
              cursor
              node {
                id
                namespace
                key
                name
                description
                type { name }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const res = await admin.graphql(query, {
      variables: { blogId, cursor },
    });

    const json = await res.json();
    const defs = json.data?.blog?.metafieldDefinitions;
    if (!defs) break;

    allMetafields.push(...defs.edges.map((e) => e.node));

    hasNextPage = defs.pageInfo.hasNextPage;
    cursor = defs.pageInfo.endCursor;
  }

  // 3. Return blog + full metafield list
  return success({
    item: { id: blogId },
    metafields: allMetafields,
  });
}

/********** ARTICLE **********/
export async function fetchArticleMeta(admin) {
  // 1. Fetch first blog ID
  const blogs = await admin.graphql(`
    query {
      blogs(first: 1) {
        edges { node { id } }
      }
    }
  `);
  const b = await blogs.json();
  const blogId = b?.data?.blogs?.edges?.[0]?.node?.id;
  if (!blogId) return fail("No blog found");

  // 2. Fetch first article ID inside that blog
  const articles = await admin.graphql(
    `
    query ($blogId: ID!) {
      blog(id: $blogId) {
        articles(first: 1) {
          edges { node { id } }
        }
      }
    }
    `,
    { variables: { blogId } },
  );
  const a = await articles.json();
  const articleId = a?.data?.blog?.articles?.edges?.[0]?.node?.id;
  if (!articleId) return fail("No article found");

  // 3. Fetch ALL metafield definitions using pagination
  let allMetafields = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const query = `
      query ($articleId: ID!, $cursor: String) {
        article(id: $articleId) {
          id
          metafieldDefinitions(first: 200, after: $cursor) {
            edges {
              cursor
              node {
                id
                namespace
                key
                name
                description
                type { name }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    const response = await admin.graphql(query, {
      variables: { articleId, cursor },
    });

    const json = await response.json();

    const defs = json.data?.article?.metafieldDefinitions;
    if (!defs) break;

    allMetafields.push(...defs.edges.map((e) => e.node));

    hasNextPage = defs.pageInfo.hasNextPage;
    cursor = defs.pageInfo.endCursor;
  }

  // 4. Return article + full metafields list
  return success({
    item: { id: articleId },
    metafields: allMetafields,
  });
}

/********** PRODUCT / ORDER / CUSTOMER ETC **********/
export async function fetchGenericMeta(admin, resource) {
  // Step 1: Get the main resource item (first node)
  const headRes = await admin.graphql(`
    query {
      ${resource}(first: 1) {
        edges {
          node {
            id
          }
        }
      }
    }
  `);
  const headJson = await headRes.json();
  const item = headJson.data?.[resource]?.edges?.[0]?.node;
  if (!item) return fail("No item found");

  // Step 2: Fetch ALL metafield definitions with pagination
  let allMetafields = [];
  let hasNextPage = true;
  let cursor = null;

  while (hasNextPage) {
    const pageQuery = `
      query FetchMetafields($cursor: String) {
        ${resource}(first: 1) {
          edges {
            node {
              metafieldDefinitions(first: 200, after: $cursor) {
                edges {
                  cursor
                  node {
                    id
                    namespace
                    key
                    name
                    description
                    type { name }
                  }
                }
                pageInfo {
                  hasNextPage
                  endCursor
                }
              }
            }
          }
        }
      }
    `;

    const pageRes = await admin.graphql(pageQuery, { cursor });
    const pageJson = await pageRes.json();

    const defs =
      pageJson.data?.[resource]?.edges?.[0]?.node?.metafieldDefinitions;

    if (!defs) break;

    allMetafields.push(...defs.edges.map((e) => e.node));

    hasNextPage = defs.pageInfo.hasNextPage;
    cursor = defs.pageInfo.endCursor;
  }

  // Step 3: return all metafields
  return success({
    item,
    metafields: allMetafields,
  });
}

/* ------------------  UPDATE MUTATION ------------------ */
export async function updateSpecificMetafield(
  admin,
  id,
  namespace,
  key,
  value,
  type,
  flag,
  objectType,
) {
  // Normalize flag ALWAYS
  flag = String(flag).toLowerCase() === "true";

  let identifier = id;

  if (!flag) {
    const res = await fetchResourceId(admin, objectType, id);
    if (!res) {
      console.error("ID RESOLUTION FAILED");
      return {
        id,
        success: false,
        errors: `Could not resolve ID for: ${id}`,
        key,
        value,
      };
    }

    identifier = res;
  }

  console.log("RAW VALUE:", value);
  console.log("METAFIELD TYPE:", type);

  let normalizedValue;

  if (type.startsWith("list.")) {
    let parsedList;

    // Case 1: value already an array
    if (Array.isArray(value)) {
      parsedList = value;
    }

    // Case 2: JSON string
    else if (typeof value === "string" && value.trim().startsWith("[")) {
      try {
        parsedList = JSON.parse(value);
      } catch (err) {
        console.error("LIST JSON PARSE FAILED:", value);
        return {
          id,
          key,
          value,
          success: false,
          errors: `Invalid JSON for list metafield (${type})`,
        };
      }
    }

    // Case 3: CSV string ("a, b , c")
    else if (typeof value === "string") {
      parsedList = value
        .split(",")
        .map(v => v.replace(/\s+/g, "").trim()) // 🔑 removes ALL spaces
        .filter(Boolean);
    }

    if (!Array.isArray(parsedList)) {
      console.error("LIST VALUE NOT ARRAY AFTER PARSE:", parsedList);
      return {
        id,
        key,
        value,
        success: false,
        errors: `Expected list-compatible value for (${type})`,
      };
    }

    normalizedValue = JSON.stringify(parsedList);
  } else {
    console.log("Detected SINGLE metafield");

    if (value === null || value === undefined) {
      normalizedValue = "";
    } else {
      normalizedValue = String(value);
    }
  }


  // --------------------------------------------------
  // METAFIELD INPUT
  // --------------------------------------------------
  const metafieldInput = {
    ownerId: identifier,
    namespace,
    key,
    type,
    value: normalizedValue,
  };


  // --------------------------------------------------
  // GRAPHQL MUTATION
  // --------------------------------------------------
  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value type }
        userErrors { field message code }
      }
    }
  `;


  const updateRes = await admin.graphql(mutation, {
    variables: { metafields: [metafieldInput] },
  });

  const json = await updateRes.json();


  // --------------------------------------------------
  // RESPONSE HANDLING
  // --------------------------------------------------
  const userErrors = json?.data?.metafieldsSet?.userErrors || [];
  const success = userErrors.length === 0;

  if (!success) {
    console.error("SHOPIFY USER ERRORS:", userErrors);
  } else {
    console.log("METAFIELD UPDATE SUCCESS");
  }

  const errorMessage =
    userErrors.length > 0
      ? userErrors.map(e => e.message).join(", ")
      : null;
  console.log(JSON.stringify(json, null, 2), '..............stringfy')

  return {
    id,
    key,
    value: normalizedValue,
    success,
    errors: errorMessage,
  };
}

export async function fetchResourceId(admin, objectType, value) {
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

    company: {
      query: `query($value: String!) {
        companies(first: 1, query: $value) {
          edges { node { id  } }
        }
      }`,
      buildQuery: (v) => `external_id:${v}`,
      path: (res) => res?.companies?.edges?.[0]?.node?.id,
    },

    companyLocation: {
      query: `query($value: String!) {
        companyLocations(first: 1, query: $value) {
          edges { node { id  } }
        }
      }`,
      buildQuery: (v) => `external_id:${v}`,
      path: (res) => res?.companyLocations?.edges?.[0]?.node?.id,
    },

    location: {
      query: `query($value: String!) {
        locations(first: 1, query: $value) {
          edges { node { id } }
        }
      }`,
      buildQuery: (v) => `name:${v}`,
      path: (res) => res?.locations?.edges?.[0]?.node?.id,
    },

    page: {
      query: `query($value: String!) {
        pages(first: 1, query: $value) {
          edges { node { id } }
        }
      }`,
      buildQuery: (v) => `handle:${v}`,
      path: (res) => res?.pages?.edges?.[0]?.node?.id,
    },

    blogpost: {
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
        productByHandle(handle: $value) {
          id
        }
      }`,
      buildQuery: (v) => v,
      path: (res) => res?.productByHandle?.id,
    },

    collection: {
      query: `query($value: String!) {
        collectionByHandle(handle: $value) {
          id
        }
      }`,
      buildQuery: (v) => v,
      path: (res) => res?.collectionByHandle?.id,
    },

    variant: {
      query: `query($value: String!) {
    productVariants(first: 1, query: $value) {
      edges {
        node {
          id
        }
      }
    }
  }`,
      buildQuery: (v) => `sku:${v}`,
      path: (res) => res?.productVariants?.edges?.[0]?.node?.id,
    },

    market: {
      query: `query($value: String!) {
        catalogs(first: 1, type: MARKET, query: $value) {
          nodes { id }
        }
      }`,
      buildQuery: (v) => `title:${v}`,
      path: (res) => res?.catalogs?.nodes?.[0]?.id,
    },
  };

  const config = queries[objectType];
  if (!config) throw new Error(`Unsupported resource type: ${objectType}`);

  const variables = { value: config.buildQuery(value) };

  const response = await admin.graphql(config.query, { variables });
  const json = await response.json();

  return config.path(json.data) || null;
}
