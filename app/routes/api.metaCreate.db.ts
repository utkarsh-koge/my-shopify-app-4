import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs } from "react-router";

const METAOBJECT_TYPE = "__tag_metafield_app_database";
// use "$app:tag_metafield_app_database" if you want app-owned

export async function action({ request }: ActionFunctionArgs) {

  try {
    const { admin } = await authenticate.admin(request);

    let hasNextPage = true;
    let cursor = null;
    let exists = false;

    while (hasNextPage) {
      const res: Response = await admin.graphql(
        `#graphql
        query CheckMetaobjectDefinitions($after: String) {
          metaobjectDefinitions(first: 50, after: $after) {
            edges {
              cursor
              node {
                id
                type
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
        `,
        { variables: { after: cursor } },
      );

      const json: any = await res.json();
      const defs: any = json?.data?.metaobjectDefinitions;

      if (!defs) break;

      for (const edge of defs.edges) {

        if (edge.node.type === METAOBJECT_TYPE) {
          exists = true;
          break;
        }
        cursor = edge.cursor;
      }

      if (exists) break;
      hasNextPage = defs.pageInfo.hasNextPage;
    }

    if (exists) {
      return { success: true, status: "already-exists" };
    }

    const createRes = await admin.graphql(
      `#graphql
      mutation CreateMetaobjectDefinition($definition: MetaobjectDefinitionCreateInput!) {
        metaobjectDefinitionCreate(definition: $definition) {
          metaobjectDefinition {
            id
            type
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
          definition: {
            type: METAOBJECT_TYPE,
            name: "Tag Metafield App Database",
            fieldDefinitions: [
              {
                key: "unique_id",
                name: "Unique ID",
                type: "single_line_text_field",
              },
              {
                key: "username",
                name: "Username",
                type: "single_line_text_field",
              },
              {
                key: "operation",
                name: "Operation",
                type: "single_line_text_field",
              },
              {
                key: "objecttype",
                name: "Object Type",
                type: "single_line_text_field",
              },
              {
                key: "value",
                name: "Value",
                type: "json",
              },
              {
                key: "restore",
                name: "Restore",
                type: "boolean",
              },
              {
                key: "time",
                name: "Time",
                type: "date_time",
              },
            ],
          },
        },
      },
    );

    const createJson = await createRes.json();

    const errors =
      createJson?.data?.metaobjectDefinitionCreate?.userErrors || [];

    if (errors.length) {
      return { success: false, error: errors };
    }

    return {
      success: true,
      status: "created",
      definition: createJson.data.metaobjectDefinitionCreate.metaobjectDefinition,
    };
  } catch (error: any) {
    return { success: false, error: "Internal server error" };
  }
}
