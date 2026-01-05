import { authenticate } from "../shopify.server";
import { nanoid } from "nanoid";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  let userName = "unknown";
  let myshopifyDomain = "unknown";

  try {
    /* ---------------- AUTH ---------------- */
    const { admin } = await authenticate.admin(request);

    /* ---------------- SHOP INFO ---------------- */
    const shopQuery = `
      query {
        shop {
          email
          myshopifyDomain
        }
      }
    `;
    const shopRes = await admin.graphql(shopQuery);
    const shopJson = await shopRes.json();

    userName =
      shopJson?.data?.shop?.email ||
      shopJson?.data?.shop?.myshopifyDomain ||
      userName;

    myshopifyDomain =
      shopJson?.data?.shop?.myshopifyDomain || myshopifyDomain;

    /* ---------------- BODY ---------------- */
    const body = await request.json();
    const { operation, objectType, value } = body;

    /* ---------------- VALIDATION ---------------- */
    if (!operation || !objectType || !value) {
      return {
        success: false,
        error: "Missing required fields",
      };
    }

    /* ---------------- CREATE METAOBJECT ---------------- */
    const unique_id = nanoid(8); // small unique id
    const currentTime = new Date().toISOString();

    const createResponse = await admin.graphql(
      `
      mutation CreateTagMetafieldDB($input: MetaobjectCreateInput!) {
        metaobjectCreate(metaobject: $input) {
          metaobject {
            id
            handle
          }
          userErrors {
            field
            message
          }
        }
      }
      `,
      {
        variables: {
          input: {
            type: "__tag_metafield_app_database",
            fields: [
              { key: "unique_id", value: unique_id },
              { key: "username", value: userName },
              { key: "operation", value: operation },
              { key: "objecttype", value: objectType },
              { key: "value", value: JSON.stringify(value) },
              { key: "restore", value: "true" },
              { key: "time", value: currentTime },
            ],
          },
        },
      }
    );

    const createData = await createResponse.json();
    const errors = createData.data.metaobjectCreate.userErrors;

    if (errors.length) {
      return {
        success: false,
        error: errors,
      };
    }

    /* ---------------- FETCH ALL RECORDS ---------------- */
    const fetchResponse = await admin.graphql(
      `
      query GetTagMetafieldDB {
        metaobjects(type: "__tag_metafield_app_database", first: 50) {
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
      `
    );

    const fetchData = await fetchResponse.json();

    return {
      success: true,
      shop: myshopifyDomain,
      created: createData.data.metaobjectCreate.metaobject,
      database: fetchData.data.metaobjects.nodes,
    };
  } catch (error: any) {
    console.error("Metaobject DB error:", error);
    return {
      success: false,
      error: "Internal server error",
    };
  }
}
