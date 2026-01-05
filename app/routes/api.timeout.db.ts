import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  try {
    /* ---------------- AUTH ---------------- */
    const { admin } = await authenticate.admin(request);
    const METAOBJECT_TYPE = "__tag_metafield_app_database";
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let hasNextPage = true;
    let cursor = null;
    let page = 1;

    let checked = 0;
    let deleted: string[] = [];
    let skipped: { id: string; reason: any }[] = [];

    while (hasNextPage) {
      const query = `
        query FetchMetaobjects($after: String) {
          metaobjects(
            type: "${METAOBJECT_TYPE}",
            first: 250,
            after: $after
          ) {
            edges {
              cursor
              node {
                id
                fields {
                  key
                  value
                }
              }
            }
            pageInfo {
              hasNextPage
            }
          }
        }
      `;

      const res: Response = await admin.graphql(query, {
        variables: { after: cursor },
      });

      const json: any = await res.json();
      const data: any = json?.data?.metaobjects;

      if (!data) {
        break;
      }

      for (const edge of data.edges) {
        checked++;
        cursor = edge.cursor;

        const node = edge.node;

        const timeField = node.fields.find((f: any) => f.key === "time");

        if (!timeField?.value) {
          skipped.push({ id: node.id, reason: "Missing time field" });
          continue;
        }

        const createdTime = new Date(timeField.value).getTime();
        if (isNaN(createdTime)) {
          skipped.push({ id: node.id, reason: "Invalid time format" });
          continue;
        }
        const age = now - createdTime;

        if (age > TWO_DAYS_MS) {
          const deleteRes = await admin.graphql(
            `
            mutation DeleteMetaobject($id: ID!) {
              metaobjectDelete(id: $id) {
                deletedId
                userErrors {
                  message
                }
              }
            }
            `,
            { variables: { id: node.id } },
          );

          const deleteJson = await deleteRes.json();
          const errors = deleteJson?.data?.metaobjectDelete?.userErrors || [];

          if (errors.length) {
            skipped.push({ id: node.id, reason: errors });
          } else {
            deleted.push(node.id);
          }
        } else {
          skipped.push({ id: node.id, reason: "Not expired" });
        }
      }

      hasNextPage = data.pageInfo.hasNextPage;
      page++;
    }
    return {
      success: true,
      checked,
      deletedCount: deleted.length,
      deletedIds: deleted,
      skippedCount: skipped.length,
    };
  } catch (error) {
    console.error("🔥 Metaobject cleanup pagination error:", error);
    return {
      success: false,
      error: "Internal server error",
    };
  }
}
