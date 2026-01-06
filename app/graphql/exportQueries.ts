type ResourceConfig = {
  query: (args?: any) => string;
  getConnection: (data: any) => any;
  baseHeaders: string[];
  buildBaseRow: (record: any) => string[];
};
const safe = (v: unknown) => (v == null ? "" : String(v));

const flattenMetafields = (r: any) =>
  (r.metafields?.edges ?? []).map(({ node }: any) => ({
    namespace: node.namespace,
    key: node.key,
    value: node.value,
  }));

export const EXPORT_RESOURCES: Record<string, ResourceConfig> = {
  /* ---------------- PRODUCTS ---------------- */
  product: {
    query: () => `
      query ($cursor: String) {
        products(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              handle
              tags
              metafields(first: 200) {
                edges { node { namespace key value } }
              }
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.products,
    baseHeaders: ["resource_id", "title", "handle"],
    buildBaseRow: (r) => [safe(r.id), safe(r.title), safe(r.handle)],
    buildMetafields: flattenMetafields,
  },

  /* ---------------- PRODUCT VARIANTS ---------------- */
  product_variant: {
    query: () => `
      query ($cursor: String) {
        productVariants(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              sku
              title
              metafields(first: 200) {
                edges { node { namespace key value } }
              }
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.productVariants,
    baseHeaders: ["resource_id", "sku", "title"],
    buildBaseRow: (r) => [safe(r.id), safe(r.sku), safe(r.title)],
    buildMetafields: flattenMetafields,
  },

  /* ---------------- COLLECTIONS ---------------- */
  collection: {
    query: () => `
      query ($cursor: String) {
        collections(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              handle
              metafields(first: 200) {
                edges { node { namespace key value } }
              }
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.collections,
    baseHeaders: ["resource_id", "title", "handle"],
    buildBaseRow: (r) => [safe(r.id), safe(r.title), safe(r.handle)],
    buildMetafields: flattenMetafields,
  },

  /* ---------------- CUSTOMERS ---------------- */
  customer: {
    query: () => `
      query ($cursor: String) {
        customers(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              firstName
              lastName
              email
              tags
              metafields(first: 200) {
                edges { node { namespace key value } }
              }
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.customers,
    baseHeaders: ["resource_id", "first_name", "last_name", "email"],
    buildBaseRow: (r) => [
      safe(r.id),
      safe(r.firstName),
      safe(r.lastName),
      safe(r.email),
    ],
    buildMetafields: flattenMetafields,
  },

  /* ---------------- ORDERS ---------------- */
  order: {
    query: () => `
      query ($cursor: String) {
        orders(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              name
              tags
              metafields(first: 200) {
                edges { node { namespace key value } }
              }
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.orders,
    baseHeaders: ["resource_id", "order_name"],
    buildBaseRow: (r) => [safe(r.id), safe(r.name)],
    buildMetafields: flattenMetafields,
  },

  /* ---------------- COMPANIES (B2B) ---------------- */
  company: {
    query: () => `
      query ($cursor: String) {
        companies(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              name
              externalId
              metafields(first: 200) {
                edges { node { namespace key value } }
              }
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.companies,
    baseHeaders: ["resource_id", "name", "external_id"],
    buildBaseRow: (r) => [safe(r.id), safe(r.name), safe(r.externalId)],
    buildMetafields: flattenMetafields,
  },

  /* ---------------- COMPANY LOCATIONS ---------------- */
  company_location: {
    query: () => `
      query ($cursor: String) {
        companyLocations(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              name
              externalId
              metafields(first: 200) {
                edges { node { namespace key value } }
              }
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.companyLocations,
    baseHeaders: ["resource_id", "name", "external_id"],
    buildBaseRow: (r) => [safe(r.id), safe(r.name), safe(r.externalId)],
    buildMetafields: flattenMetafields,
  },

  /* ---------------- STORE LOCATIONS ---------------- */
  location: {
    query: () => `
      query ($cursor: String) {
        locations(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              name
              metafields(first: 200) {
                edges { node { namespace key value } }
              }
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.locations,
    baseHeaders: ["resource_id", "name"],
    buildBaseRow: (r) => [safe(r.id), safe(r.name)],
    buildMetafields: flattenMetafields,
  },

  /* ---------------- PAGES ---------------- */
  page: {
    query: () => `
      query ($cursor: String) {
        pages(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              handle
              metafields(first: 200) {
                edges { node { namespace key value } }
              }
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.pages,
    baseHeaders: ["resource_id", "title", "handle"],
    buildBaseRow: (r) => [safe(r.id), safe(r.title), safe(r.handle)],
    buildMetafields: flattenMetafields,
  },

  /* ---------------- BLOGS ---------------- */
  blog: {
    query: () => `
      query ($cursor: String) {
        blogs(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              handle
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.blogs,
    baseHeaders: ["resource_id", "title", "handle"],
    buildBaseRow: (r) => [safe(r.id), safe(r.title), safe(r.handle)],
  },

  /* ---------------- BLOG POSTS ---------------- */
  blog_post: {
    query: () => `
      query ($cursor: String) {
        articles(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              title
              handle
              tags
              metafields(first: 200) {
                edges { node { namespace key value } }
              }
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.articles,
    baseHeaders: ["resource_id", "title", "handle"],
    buildBaseRow: (r) => [safe(r.id), safe(r.title), safe(r.handle)],
    buildMetafields: flattenMetafields,
  },

  /* ---------------- MARKETS ---------------- */
  market: {
    query: () => `
      query ($cursor: String) {
        markets(first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              name
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.markets,
    baseHeaders: ["resource_id", "name"],
    buildBaseRow: (r) => [safe(r.id), safe(r.name)],
  },

  /* ---------------- METAOBJECTS ---------------- */
  metaobject: {
    query: ({ type }: { type: string }) => `
      query ($cursor: String) {
        metaobjects(type: "${type}", first: 200, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              type
              handle
              fields {
                key
                value
              }
            }
          }
        }
      }
    `,
    getConnection: (d) => d?.data?.metaobjects,
    baseHeaders: ["resource_id", "type", "handle"],
    buildBaseRow: (r) => [safe(r.id), safe(r.type), safe(r.handle)],
  },
};
