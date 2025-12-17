import { authenticate } from "../shopify.server";
import { fetchResourceId as fetchMetaResourceID } from "app/functions/metafield-clear-action";
import { fetchResourceId as fetchTagResourceID } from "app/functions/remove-tag-action";

// ======================================================
// MAIN ACTION: HANDLES TAGS + METAFIELDS
// ======================================================
export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();

    const rawRows = formData.get("rows");
    const rows = JSON.parse(rawRows || "[]");
    const row = rows[0];

    if (!row) {
      return Response.json({
        success: false,
        errors: [{ message: "No row data provided" }],
      });
    }

    const objectType = row.objectType;
    let resolvedId = row.id;
    console.log(objectType, '........object')
    // ======================================================
    // STEP 1: RESOLVE ID IF NOT SHOPIFY GID
    // ======================================================
    const isShopifyGID =
      typeof resolvedId === "string" &&
      resolvedId.startsWith("gid://shopify/");

    if (!isShopifyGID) {
      try {
        // Use correct resolver based on operation
        if (row.tags) {
          resolvedId = await fetchTagResourceID(
            admin,
            objectType,
            resolvedId
          );
        } else if (row.namespace && row.key) {
          resolvedId = await fetchMetaResourceID(
            admin,
            objectType,
            resolvedId
          );
        }
      } catch (err) {
        return Response.json({
          success: false,
          errors: [{ message: `ID resolution failed: ${err.message}` }],
        });
      }

      if (!resolvedId) {
        return Response.json({
          success: false,
          errors: [{ message: "Unable to resolve Shopify ID" }],
        });
      }
    }

    // ======================================================
    // CASE 1: TAG RESTORE (UNDO)
    // ======================================================
    if (row?.tags && row.tags.length > 0) {
      // UNDO "Tags-Added" -> Remove Tags
      if (row.operation === "Tags-Added") {
        const mutation = `
        mutation removeTags($id: ID!, $tags: [String!]!) {
          tagsRemove(id: $id, tags: $tags) {
            userErrors { message }
          }
        }
      `;
        const response = await admin.graphql(mutation, {
          variables: { id: resolvedId, tags: row.tags },
        });
        const json = await response.json();
        const errors = json?.data?.tagsRemove?.userErrors || [];
        if (errors.length) return Response.json({ success: false, errors });
        return Response.json({ success: true });
      }

      // UNDO "Tags-removed" -> Add Tags (Restore)
      const mutation = `
        mutation tagOp($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) {
            userErrors { field message }
          }
        }
      `;

      const response = await admin.graphql(mutation, {
        variables: {
          id: resolvedId,
          tags: row.tags,
        },
      });

      const json = await response.json();
      const errors = json?.data?.tagsAdd?.userErrors || [];

      if (errors.length) {
        return Response.json({ success: false, errors });
      }

      return Response.json({ success: true });
    }
    console.log(row, 'response')

    // ======================================================
    // CASE 2: METAFIELD RESTORE (UNDO)
    // ======================================================
    if (row?.namespace && row?.key) {
      // UNDO "Metafield-updated" -> Delete Metafield (as per user request)
      if (row.operation === "Metafield-updated") {
        const deleteQuery = `
        mutation ($metafields: [MetafieldIdentifierInput!]!) {
          metafieldsDelete(metafields: $metafields) {
            deletedMetafields { ownerId namespace key }
            userErrors { field message }
          }
        }
      `;
        const response = await admin.graphql(deleteQuery, {
          variables: {
            metafields: [
              { ownerId: resolvedId, namespace: row.namespace, key: row.key },
            ],
          },
        });
        const json = await response.json();
        console.log(json, 'response')
        const errors = json?.data?.metafieldsDelete?.userErrors || [];
        if (errors.length) return Response.json({ success: false, errors });
        return Response.json({ success: true });
      }

      // UNDO "Metafield-removed" -> Set Metafield (Restore)
      const { namespace, key, value, type } = row;

      const result = await updateSpecificMetafield(
        admin,
        resolvedId,
        namespace,
        key,
        value,
        type
      );

      if (!result.success) {
        return Response.json({
          success: false,
          errors: result.errors,
        });
      }

      return Response.json({ success: true });
    }

    // ======================================================
    // UNKNOWN RESTORE TYPE
    // ======================================================
    return Response.json({
      success: false,
      errors: [
        {
          message:
            "Invalid restore request. No tags or metafields present.",
        },
      ],
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        errors: [{ message: err.message || "Unexpected server error" }],
      },
      { status: 500 }
    );
  }
}

// ======================================================
// METAFIELD RESTORE HELPER
// ======================================================
async function updateSpecificMetafield(admin, id, namespace, key, value, type) {
  const metafieldInput = {
    ownerId: id,
    namespace,
    key,
    type,
    value,
  };

  const mutation = `
        mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
            metafieldsSet(metafields: $metafields) {
                metafields { id namespace key value type }
                userErrors { field message code }
            }
        }
    `;

  console.log("Metafield restore mutation prepared:", metafieldInput);

  const updateRes = await admin.graphql(mutation, {
    variables: { metafields: [metafieldInput] },
  });

  const json = await updateRes.json();
  console.log("📥 Metafield Response:", JSON.stringify(json, null, 2));

  const userErrors = json?.data?.metafieldsSet?.userErrors || [];
  const success = userErrors.length === 0;

  return {
    success,
    errors: userErrors,
  };
}
