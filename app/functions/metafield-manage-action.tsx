export const queryMap = {
  product: "products",
  productVariant: "productVariants",
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
  value,
  type,
  flag,
  flag1,
  objectType,
) {
  flag = String(flag).toLowerCase() === "true";
  flag1 = String(flag1).toLowerCase() === "true";

  if (isEmptyValue(value) && flag1) {
    return {
      id,
      key,
      value,
      success: false,
      errors: `Value is empty: ${value}`,
    };
  }

  let ownerId = id;
  console.log("▶️ REMOVE INPUT", { id, namespace, key, value, type, flag, flag1, objectType });

  if (!flag) {
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

  if (flag1 && type.startsWith("list.")) {

    if (type === "list.metaobject_reference") {
      const isMetaobjectId = (v) =>
        typeof v === "string" &&
        /^gid:\/\/shopify\/Metaobject\/\d+$/.test(v.trim());

      const resolveRemoveValue = async (raw) => {
        if (!raw) return null;
        if (isMetaobjectId(raw)) return raw;

        return await getMetaobjectIdFromMetafield(admin, {
          namespace,
          key,
          objectType,
          metaobjectHandle: raw,
        });
      };

      let removeList;

      if (Array.isArray(value)) {
        removeList = value;
      } else if (typeof value === "string" && value.trim().startsWith("[")) {
        try {
          removeList = JSON.parse(value);
        } catch {
          return {
            id: ownerId,
            success: false,
            errors: "Invalid JSON for remove values",
            data: null,
          };
        }
      } else if (typeof value === "string") {
        removeList = value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
      }

      if (!Array.isArray(removeList) || removeList.length === 0) {
        return {
          id: ownerId,
          success: false,
          errors: "No valid values provided for removal",
          data: null,
        };
      }

      const existingRaw = await fetchExistingMetafield(
        admin,
        ownerId,
        namespace,
        key
      );

      if (!existingRaw) {
        return {
          id: ownerId,
          success: false,
          errors: "Metafield does not exist",
          data: null,
        };
      }

      let existingList = [];
      try {
        existingList = JSON.parse(existingRaw);
      } catch {
        existingList = [];
      }

      const resolvedRemoveIds = [];

      for (const item of removeList) {
        const resolved = await resolveRemoveValue(item);
        if (!resolved) {
          return {
            id: ownerId,
            success: false,
            errors: `Metaobject not found: ${item}`,
            data: null,
          };
        }
        resolvedRemoveIds.push(resolved);
      }

      const filteredList = existingList.filter(
        (v) => !resolvedRemoveIds.includes(v)
      );

      const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value type }
        userErrors { field message code }
      }
    }
  `;

      const updateRes = await admin.graphql(mutation, {
        variables: {
          metafields: [
            {
              ownerId,
              namespace,
              key,
              type,
              value: JSON.stringify(filteredList),
            },
          ],
        },
      });

      const json = await updateRes.json();
      const errors = json?.data?.metafieldsSet?.userErrors || [];

      return {
        id: ownerId,
        success: errors.length === 0,
        key,
        namespace,
        type,
        data: removeList,
        errors: errors.length ? errors.map((e) => e.message).join(", ") : null,
      };
    }

    else if (type === "list.product_reference" || type === "list.variant_reference" || type === "list.collection_reference" || type === "list.order_reference" || type === "list.customer_reference" || type === "list.page_reference" || type === "list.article_reference" || type === "list.company_reference") {

      const isShopifyGid = (value) =>
        typeof value === "string" && value.trim().startsWith("gid://shopify/");


      let incomingList;

      if (Array.isArray(value)) {
        incomingList = value;
      } else if (typeof value === "string" && value.trim().startsWith("[")) {
        try {
          incomingList = JSON.parse(value);
        } catch {
          return {
            id,
            key,
            value,
            success: false,
            errors: "Invalid JSON array for list reference metafield",
          };
        }
      } else if (typeof value === "string") {
        incomingList = value
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);
      }

      if (!Array.isArray(incomingList)) {
        return {
          id,
          key,
          value,
          success: false,
          errors: "Invalid list reference value",
        };
      }

      let resourceType = type
        .replace("list.", "")
        .replace("_reference", "");

      if (resourceType === "variant") resourceType = "productvariant";
      if (resourceType === "article") resourceType = "blogpost";

      const resolvedIds = [];

      for (const item of incomingList) {
        let resolvedId = item;

        if (!isShopifyGid(item)) {
          const resolved = await fetchResourceIdResourceReference(
            admin,
            resourceType.toLowerCase(),
            item
          );

          if (!resolved) {
            return {
              id,
              key,
              value,
              success: false,
              errors: `Could not resolve ${resourceType} reference: ${item}`,
            };
          }

          resolvedId = resolved;
        }

        resolvedIds.push(resolvedId);
      }

      // Deduplicate remove IDs
      const uniqueRemoveIds = [...new Set(resolvedIds)];

      const existingRaw = await fetchExistingMetafield(
        admin,
        ownerId,
        namespace,
        key
      );

      if (!existingRaw) {
        return {
          id: ownerId,
          success: false,
          key,
          namespace,
          type,
          errors: `Metafield does not exist on ${objectType}`,
        };
      }

      let existingList;
      try {
        existingList = JSON.parse(existingRaw);
        if (!Array.isArray(existingList)) throw new Error();
      } catch {
        return {
          id: ownerId,
          success: false,
          key,
          namespace,
          type,
          errors: "Existing metafield value is not a valid list",
        };
      }

      const existingToRemove = uniqueRemoveIds.filter((id) =>
        existingList.includes(id)
      );

      // If NONE of the IDs exist → stop
      if (existingToRemove.length === 0) {
        return {
          id: ownerId,
          success: false,
          key,
          namespace,
          type,
          errors: "None of the provided IDs exist in the metafield",
        };
      }

      const filteredList = existingList.filter(
        (v) => !existingToRemove.includes(v)
      );
      if (filteredList.length === 0) {
        await admin.graphql(
          `
      mutation ($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          userErrors { message }
        }
      }
      `,
          {
            variables: {
              metafields: [{ ownerId, namespace, key }],
            },
          }
        );

        return {
          id: ownerId,
          success: true,
          key,
          namespace,
          type,
          data: existingToRemove,
          errors: null,
        };
      }

      const updateRes = await admin.graphql(
        `
    mutation ($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value type }
        userErrors { field message code }
      }
    }
    `,
        {
          variables: {
            metafields: [
              {
                ownerId,
                namespace,
                key,
                type,
                value: JSON.stringify(filteredList),
              },
            ],
          },
        }
      );

      const json = await updateRes.json();

      if (!json?.data?.metafieldsSet) {
        return {
          id: ownerId,
          success: false,
          key,
          namespace,
          type,
          errors: "Metafield update failed",
        };
      }

      const errors = json.data.metafieldsSet.userErrors || [];

      return {
        id: ownerId,
        success: errors.length === 0,
        key,
        namespace,
        type,
        data: existingToRemove,
        errors: errors.length ? errors.map((e) => e.message).join(", ") : null,
      };
    }

    else {
      const existingRaw = await fetchExistingMetafield(
        admin,
        ownerId,
        namespace,
        key
      );

      if (!existingRaw) {
        return {
          id: ownerId,
          success: false,
          key,
          namespace,
          type,
          errors: `Metafield does not exist on ${objectType}`,
        };
      }
      let existingList;
      try {
        existingList = JSON.parse(existingRaw);
        if (!Array.isArray(existingList)) throw new Error();
      } catch {
        return {
          id: ownerId,
          success: false,
          key,
          namespace,
          type,
          errors: "Existing metafield value is not a valid list",
        };
      }

      let normalizedValue = value;
      if (
        typeof normalizedValue === "string" &&
        normalizedValue.trim().startsWith("[")
      ) {
        const parsed = JSON.parse(normalizedValue);
        if (Array.isArray(parsed)) {
          normalizedValue = parsed[0];
        }
      }
      if (Array.isArray(normalizedValue)) {
        normalizedValue = normalizedValue[0];
      }
      if (typeof normalizedValue === "string") {
        normalizedValue = normalizedValue.trim();
      }
      const exists = existingList.includes(normalizedValue);

      if (!exists) {
        return {
          id: ownerId,
          success: false,
          key,
          namespace,
          type,
          errors: "Provided value does not exist in metafield : " + normalizedValue,
        };
      }
      const filteredList = existingList.filter(
        (v) => v !== normalizedValue
      );

      if (filteredList.length === 0) {
        await admin.graphql(
          `
      mutation ($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          userErrors { message }
        }
      }
      `,
          {
            variables: {
              metafields: [{ ownerId, namespace, key }],
            },
          }
        );

        return {
          id: ownerId,
          success: true,
          key,
          namespace,
          type,
          data: [normalizedValue],
          errors: null,
        };
      }

      const updateRes = await admin.graphql(
        `
    mutation ($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value type }
        userErrors { field message code }
      }
    }
    `,
        {
          variables: {
            metafields: [
              {
                ownerId,
                namespace,
                key,
                type,
                value: JSON.stringify(filteredList),
              },
            ],
          },
        }
      );

      const json = await updateRes.json();

      if (!json?.data?.metafieldsSet) {
        return {
          id: ownerId,
          success: false,
          key,
          namespace,
          type,
          errors: "Metafield update failed",
        };
      }

      const errors = json.data.metafieldsSet.userErrors || [];

      return {
        id: ownerId,
        success: errors.length === 0,
        key,
        namespace,
        type,
        data: [normalizedValue],
        errors: errors.length ? errors.map((e) => e.message).join(", ") : null,
      };
    }

  }

  const result = await deleteMetafields(admin, [{ ownerId, namespace, key }]);

  return {
    id: ownerId,
    success: result[0].success,
    data: result[0].data,
    errors: result[0].errors,
  };
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
  if (resource === "article") return await fetchBlogPostMeta(admin);
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
export async function fetchBlogPostMeta(admin) {
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

const isEmptyValue = (value: unknown): boolean => {
  if (value == null) return true;

  // Empty string
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return true;
    if (trimmed === '[]') return true;

    // Optional: detect JSON empty array
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && parsed.length === 0) return true;
    } catch {
      /* ignore */
    }
  }

  // Actual array
  if (Array.isArray(value)) {
    return value.length === 0;
  }

  return false;
};

/* ------------------  UPDATE MUTATION ------------------ */
export async function updateSpecificMetafield(
  admin,
  id,
  namespace,
  key,
  value,
  type,
  flag,  // owner ID resolution
  flag2, // list replace vs merge
  objectType,
) {
  flag = String(flag).toLowerCase() === "true";
  flag2 = String(flag2).toLowerCase() === "true";

  if (isEmptyValue(value)) {
    return {
      id,
      key,
      value,
      success: false,
      errors: `Value is empty: ${value}`,
    };
  }
  console.log("▶️ INPUT", { id, namespace, key, value, type, flag, flag2, objectType });

  //  STEP 1: Resolve resource ID 
  let ownerId = id;

  if (!flag) {
    const resolved = await fetchResourceId(admin, objectType, id);
    if (!resolved) {
      return {
        id,
        key,
        value,
        success: false,
        errors: `Could not find ${objectType} for: ${id}`,
      };
    }
    ownerId = resolved;
  }
  //  HELPERS functions
  function isMetaobjectId(v) {
    return (
      typeof v === "string" &&
      /^gid:\/\/shopify\/Metaobject\/\d+$/.test(v.trim())
    );
  }
  function isShopifyGid(value) {
    return (
      typeof value === "string" &&
      value.trim().startsWith("gid://shopify/")
    );
  }

  async function resolveMetaobjectValue(raw) {
    if (!raw) return null;

    if (isMetaobjectId(raw)) return raw;

    const resolved = await getMetaobjectIdFromMetafield(admin, {
      namespace,
      key,
      objectType,
      metaobjectHandle: raw,
    });

    return resolved || null;
  }

  //  STEP 2: NORMALIZE VALUE BASED ON TYPE
  let normalizedValue;
  let responseValue = value;
  //  SINGLE METAOBJECT REFERENCE
  if (type === "metaobject_reference") {
    const resolvedId = await resolveMetaobjectValue(value);

    if (!resolvedId) {
      return {
        id,
        key,
        value,
        success: false,
        errors: `Could not resolve metaobject reference: ${value}`,
      };
    }

    normalizedValue = resolvedId;
    responseValue = resolvedId;
  }

  /* ---------- LIST METAOBJECT REFERENCE ---------- */
  else if (type === "list.metaobject_reference") {
    let incomingList;

    if (Array.isArray(value)) {
      incomingList = value;
    } else if (typeof value === "string" && value.trim().startsWith("[")) {
      try {
        incomingList = JSON.parse(value);
      } catch {
        return {
          id,
          key,
          value,
          success: false,
          errors: "Invalid JSON for list.metaobject_reference",
        };
      }
    } else if (typeof value === "string") {
      incomingList = value.split(",").map(v => v.trim()).filter(Boolean);
    }

    if (!Array.isArray(incomingList)) {
      return {
        id,
        key,
        value,
        success: false,
        errors: "Invalid list.metaobject_reference value",
      };
    }

    const resolvedIds = [];

    for (const item of incomingList) {
      const resolved = await resolveMetaobjectValue(item);
      if (!resolved) {
        return {
          id,
          key,
          value,
          success: false,
          errors: `Could not resolve metaobject reference: ${item}`,
        };
      }
      resolvedIds.push(resolved);
    }

    if (flag2) {
      normalizedValue = JSON.stringify(resolvedIds);
      responseValue = JSON.stringify(resolvedIds);
    } else {
      const existingRaw = await fetchExistingMetafield(
        admin,
        ownerId,
        namespace,
        key,
      );

      let existingList = [];
      try {
        existingList = existingRaw ? JSON.parse(existingRaw) : [];
      } catch { }

      const merged = Array.from(new Set([...existingList, ...resolvedIds]));
      normalizedValue = JSON.stringify(merged);
      responseValue = JSON.stringify(resolvedIds);
    }
  }
  /////
  //  SINGLE RESOURCE REFERENCE
  else if (type === "product_reference" || type === "variant_reference" || type === "collection_reference" || type === "order_reference" || type === "customer_reference" || type === "page_reference" || type === "article_reference" || type === "company_reference") {
    console.log(type, 'sssssssssssssssssssssss', objectType, value);
    if (!isShopifyGid(value)) {
      let resourceType = type;
      if (resourceType === "variant_reference") resourceType = "productvariant";
      if (resourceType === "collection_reference") resourceType = "collection";
      if (resourceType === "order_reference") resourceType = "order";
      if (resourceType === "customer_reference") resourceType = "customer";
      if (resourceType === "page_reference") resourceType = "page";
      if (resourceType === "article_reference") resourceType = "blogpost";
      if (resourceType === "company_reference") resourceType = "company";
      console.log(resourceType, 'resourceType');
      const resolved = await fetchResourceIdResourceReference(admin, resourceType?.toLowerCase(), value);
      if (!resolved) {
        return {
          id,
          key,
          value,
          success: false,
          errors: `Could not find ${objectType} for: ${value}`,
        };
      }
      ownerId = resolved;
    }
    console.log(ownerId, 'ownerId');
    normalizedValue = ownerId;
    responseValue = ownerId;
  }

  /* ---------- LIST RESOURCE REFERENCE ---------- */
  else if (
    type === "list.product_reference" ||
    type === "list.variant_reference" ||
    type === "list.collection_reference" ||
    type === "list.order_reference" ||
    type === "list.customer_reference" ||
    type === "list.page_reference" ||
    type === "list.article_reference" ||
    type === "list.company_reference"
  ) {
    let incomingList;

    /* -------- Parse incoming value -------- */
    if (Array.isArray(value)) {
      incomingList = value;
    } else if (typeof value === "string" && value.trim().startsWith("[")) {
      try {
        incomingList = JSON.parse(value);
      } catch {
        return {
          id,
          key,
          value,
          success: false,
          errors: "Invalid JSON array for list reference metafield",
        };
      }
    } else if (typeof value === "string") {
      incomingList = value
        .split(",")
        .map(v => v.trim())
        .filter(Boolean);
    }

    if (!Array.isArray(incomingList)) {
      return {
        id,
        key,
        value,
        success: false,
        errors: "Invalid list reference value",
      };
    }

    /* -------- Determine resource type -------- */
    let resourceType = type
      .replace("list.", "")
      .replace("_reference", "");

    if (resourceType === "variant") resourceType = "productvariant";
    if (resourceType === "article") resourceType = "blogpost";

    const resolvedIds = [];

    /* -------- Resolve each value -------- */
    for (const item of incomingList) {
      let resolvedId = item;

      if (!isShopifyGid(item)) {
        const resolved = await fetchResourceIdResourceReference(
          admin,
          resourceType.toLowerCase(),
          item
        );

        if (!resolved) {
          return {
            id,
            key,
            value,
            success: false,
            errors: `Could not resolve ${resourceType} reference: ${item}`,
          };
        }

        resolvedId = resolved;
      }

      resolvedIds.push(resolvedId);
    }

    /* -------- Apply flag logic -------- */
    if (flag2) {
      normalizedValue = JSON.stringify(resolvedIds);
      responseValue = JSON.stringify(resolvedIds);
    } else {
      const existingRaw = await fetchExistingMetafield(
        admin,
        ownerId,
        namespace,
        key
      );

      let existingList = [];
      try {
        existingList = existingRaw ? JSON.parse(existingRaw) : [];
      } catch { }

      const merged = Array.from(new Set([...existingList, ...resolvedIds]));

      normalizedValue = JSON.stringify(merged);
      responseValue = JSON.stringify(resolvedIds);
    }
  }

  /////
  /* ---------- OTHER LIST TYPES ---------- */
  else if (type.startsWith("list.")) {
    let incomingList;

    if (Array.isArray(value)) {
      incomingList = value;
    } else if (typeof value === "string" && value.trim().startsWith("[")) {
      try {
        incomingList = JSON.parse(value);
      } catch {
        return {
          id,
          key,
          value,
          success: false,
          errors: `Invalid JSON for ${type}`,
        };
      }
    } else if (typeof value === "string") {
      incomingList = value.split(",").map(v => v.trim()).filter(Boolean);
    }

    if (!Array.isArray(incomingList)) {
      return {
        id,
        key,
        value,
        success: false,
        errors: `Expected list value for ${type}`,
      };
    }

    if (flag2) {
      normalizedValue = JSON.stringify(incomingList);
      responseValue = JSON.stringify(incomingList);
    } else {
      const existingRaw = await fetchExistingMetafield(
        admin,
        ownerId,
        namespace,
        key,
      );

      let existingList = [];
      try {
        existingList = existingRaw ? JSON.parse(existingRaw) : [];
      } catch { }

      const merged = Array.from(new Set([...existingList, ...incomingList]));
      normalizedValue = JSON.stringify(merged);
      responseValue = JSON.stringify(incomingList);
    }
  }

  /* ---------- SCALAR TYPES ---------- */
  else {
    normalizedValue =
      value === null || value === undefined ? "" : String(value);
  }

  //  STEP 3: SET METAFIELD
  const metafieldInput = {
    ownerId,
    namespace,
    key,
    type,
    value: normalizedValue,
  };

  const mutation = `
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields { id namespace key value type }
        userErrors { field message code }
      }
    }
  `;

  const res = await admin.graphql(mutation, {
    variables: { metafields: [metafieldInput] },
  });

  const json = await res.json();
  const errors = json?.data?.metafieldsSet?.userErrors || [];

  return {
    id,
    key,
    namespace,
    value: responseValue,
    success: errors.length === 0,
    errors: errors.length ? errors.map(e => e.message).join(", ") : null,
  };
}

async function fetchExistingMetafield(admin, ownerId, namespace, key) {
  const query = `
    query getMetafield($id: ID!, $namespace: String!, $key: String!) {
      node(id: $id) {
        ... on HasMetafields {
          metafield(namespace: $namespace, key: $key) {
            value
          }
        }
      }
    }
  `;

  const res = await admin.graphql(query, {
    variables: { id: ownerId, namespace, key },
  });

  const json = await res.json();
  return json?.data?.node?.metafield?.value ?? null;
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

    blogPost: {
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
      query: `
    query ($value: String!) {
      markets(first: 1, query: $value) {
        nodes {
          id
        }
      }
    }
  `,
      buildQuery: (v) => `name:${String(v).trim()}`,
      path: (res) => res?.markets?.nodes?.[0]?.id,
    },


  };
  const config = queries[objectType];
  if (!config) {
    throw new Error(`Unsupported resource type: ${objectType}`);
  }

  const builtValue = config.buildQuery(value);
  const variables = { value: builtValue };
  const response = await admin.graphql(config.query, { variables });
  const json = await response.json();
  const result = config.path(json.data) || null;
  console.log("resolved id:", result);

  return result;
}

const metafieldOwnerTypeMap = {
  product: "PRODUCT",
  productVariant: "PRODUCTVARIANT",
  collection: "COLLECTION",
  customer: "CUSTOMER",
  order: "ORDER",
  company: "COMPANY",
  companyLocation: "COMPANY_LOCATION",
  location: "LOCATION",
  page: "PAGE",
  blog: "BLOG",
  blogPost: "ARTICLE",
  market: "MARKET",
};

export async function getMetaobjectIdFromMetafield(
  admin,
  { namespace, key, objectType, metaobjectHandle }
) {

  const ownerType = metafieldOwnerTypeMap[objectType];

  if (!ownerType) {
    console.error("❌ Invalid objectType");
    return null;
  }

  /* STEP 2: Fetch metafield definition */
  const defRes = await admin.graphql(
    `#graphql
    query ($namespace: String!, $key: String!, $ownerType: MetafieldOwnerType!) {
      metafieldDefinition(
        identifier: {
          namespace: $namespace
          key: $key
          ownerType: $ownerType
        }
      ) {
        validations {
          name
          value
        }
      }
    }`,
    { variables: { namespace, key, ownerType } }
  );

  const defJson = await defRes.json();
  const metaobjectDefinitionId =
    defJson?.data?.metafieldDefinition?.validations?.find(
      (v) => v.name === "metaobject_definition_id"
    )?.value;

  if (!metaobjectDefinitionId) {
    console.error("❌ Metafield is NOT a metaobject reference");
    return null;
  }

  /* STEP 4: Resolve metaobject type */
  const typeRes = await admin.graphql(
    `#graphql
    query ($id: ID!) {
      metaobjectDefinition(id: $id) {
        type
      }
    }`,
    { variables: { id: metaobjectDefinitionId } }
  );

  const typeJson = await typeRes.json();
  const metaobjectType = typeJson?.data?.metaobjectDefinition?.type;

  if (!metaobjectType) {
    console.error("❌ Could not resolve metaobject type");
    return null;
  }

  /* STEP 5: Fetch metaobject by HANDLE (✅ FIXED) */
  const metaRes = await admin.graphql(
    `#graphql
    query ($type: String!, $handle: String!) {
      metaobjectByHandle(handle: { type: $type, handle: $handle }) {
        id
        handle
      }
    }`,
    {
      variables: {
        type: metaobjectType,
        handle: metaobjectHandle,
      },
    }
  );

  const metaJson = await metaRes.json();
  const metaobjectId = metaJson?.data?.metaobjectByHandle?.id;

  if (!metaobjectId) {
    console.error("❌ Metaobject not found for handle:", metaobjectHandle);
    return null;
  }

  console.log("✅ FINAL metaobjectId →", metaobjectId);
  return metaobjectId;
}

export async function fetchResourceIdResourceReference(admin, objectType, value) {
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

    productvariant: {
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

  };
  const config = queries[objectType];
  if (!config) {
    throw new Error(`Unsupported resource type: ${objectType}`);
  }

  const builtValue = config.buildQuery(value);
  const variables = { value: builtValue };
  const response = await admin.graphql(config.query, { variables });
  const json = await response.json();
  const result = config.path(json.data) || null;
  console.log("resolved id:", result);

  return result;
}
