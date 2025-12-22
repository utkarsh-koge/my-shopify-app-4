import { authenticate } from "../shopify.server";
import { fetchResourceId as fetchMetaResourceID } from "app/functions/metafield-manage-action";
import { fetchResourceId as fetchTagResourceID } from "app/functions/remove-tag-action";

export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);
    const formData = await request.formData();

    const rawRows = formData.get("rows");
    const rows = JSON.parse(rawRows || "[]");
    const row = rows[0];

    console.log("📦 Incoming row:", row);

    if (!row) {
      return Response.json({
        success: false,
        errors: [{ message: "No row data provided" }],
      });
    }

    const objectType = row.objectType;
    let resolvedId = row.id;
    const isShopifyGID =
      typeof resolvedId === "string" && resolvedId.startsWith("gid://shopify/");

    if (!isShopifyGID) {
      try {
        if (row.tags) {
          resolvedId = await fetchTagResourceID(admin, objectType, resolvedId);
        } else if (row.namespace && row.key) {
          resolvedId = await fetchMetaResourceID(admin, objectType, resolvedId);
        }
      } catch (err) {
        console.error("❌ ID resolution failed:", err);
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
    // TAG UNDO LOGIC
    if (row?.tags?.length) {
      if (row.operation === "Tags-Added") {
        const mutation = `
          mutation ($id: ID!, $tags: [String!]!) {
            tagsRemove(id: $id, tags: $tags) {
              userErrors { message }
            }
          }
        `;

        const res = await admin.graphql(mutation, {
          variables: { id: resolvedId, tags: row.tags },
        });

        const json = await res.json();

        const errors = json?.data?.tagsRemove?.userErrors || [];
        if (errors.length) return Response.json({ success: false, errors });

        return Response.json({ success: true });
      }

      const mutation = `
        mutation ($id: ID!, $tags: [String!]!) {
          tagsAdd(id: $id, tags: $tags) {
            userErrors { field message }
          }
        }
      `;

      const res = await admin.graphql(mutation, {
        variables: { id: resolvedId, tags: row.tags },
      });

      const json = await res.json();

      const errors = json?.data?.tagsAdd?.userErrors || [];
      if (errors.length) return Response.json({ success: false, errors });

      return Response.json({ success: true });
    }

    // METAFIELD UNDO LOGIC
    if (row?.namespace && row?.key) {
      const { namespace, key, value, type } = row;
      const metafieldType = typeof type === "string" ? type : type?.name;

      const isListType = metafieldType?.startsWith("list.");

      if (row.operation === "Metafield-removed") {
        // 🔹 LIST TYPE → MERGE (Restore removed values)
        if (isListType) {
          const existingRaw = await fetchExistingMetafield(
            admin,
            resolvedId,
            namespace,
            key,
          );

          const existingList = normalizeListValue(existingRaw);
          const incomingList = normalizeListValue(value);

          const mergedList = Array.from(
            new Set([...existingList, ...incomingList]),
          );

          const result = await updateSpecificMetafield(
            admin,
            resolvedId,
            namespace,
            key,
            JSON.stringify(mergedList),
            metafieldType,
          );

          return Response.json(
            result.success
              ? { success: true }
              : { success: false, errors: result.errors },
          );
        }

        const result = await updateSpecificMetafield(
          admin,
          resolvedId,
          namespace,
          key,
          value,
          metafieldType,
        );

        return Response.json(
          result.success
            ? { success: true }
            : { success: false, errors: result.errors },
        );
      }

      if (row.operation === "Metafield-updated") {
        if (isListType) {
          const existingRaw = await fetchExistingMetafield(
            admin,
            resolvedId,
            namespace,
            key,
          );

          if (!existingRaw) return Response.json({ success: true });

          const existingList = normalizeListValue(existingRaw);
          const removeList = normalizeListValue(value);
          const updatedList = existingList.filter(
            (v) => !removeList.includes(v),
          );
          // Empty → delete metafield
          if (updatedList.length === 0) {
            const query = `
          mutation ($metafields: [MetafieldIdentifierInput!]!) {
            metafieldsDelete(metafields: $metafields) {
              userErrors { field message }
            }
          }
        `;
            const delRes = await admin.graphql(query, {
              variables: {
                metafields: [{ ownerId: resolvedId, namespace, key }],
              },
            });

            const delJson = await delRes.json();
            const errors = delJson?.data?.metafieldsDelete?.userErrors || [];
            if (errors.length) return Response.json({ success: false, errors });

            return Response.json({ success: true });
          }

          // Update remaining list
          const result = await updateSpecificMetafield(
            admin,
            resolvedId,
            namespace,
            key,
            JSON.stringify(updatedList),
            metafieldType,
          );

          return Response.json(
            result.success
              ? { success: true }
              : { success: false, errors: result.errors },
          );
        }

        const delRes = await admin.graphql(
          `
      mutation ($metafields: [MetafieldIdentifierInput!]!) {
        metafieldsDelete(metafields: $metafields) {
          userErrors { field message }
        }
      }
    `,
          {
            variables: {
              metafields: [{ ownerId: resolvedId, namespace, key }],
            },
          },
        );

        const delJson = await delRes.json();
        const errors = delJson?.data?.metafieldsDelete?.userErrors || [];
        if (errors.length) return Response.json({ success: false, errors });

        return Response.json({ success: true });
      }
    }

    return Response.json({
      success: false,
      errors: [{ message: "Invalid restore request" }],
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        errors: [{ message: err.message || "Unexpected server error" }],
      },
      { status: 500 },
    );
  }
}

async function updateSpecificMetafield(
  admin,
  id,
  namespace,
  key,
  value,
  metafieldType,
) {
  const type =
    typeof metafieldType === "string" ? metafieldType : metafieldType?.name;

  if (!type) {
    return {
      success: false,
      errors: [{ message: "Missing metafield type" }],
    };
  }

  const finalValue = type.startsWith("list.")
    ? typeof value === "string"
      ? value
      : JSON.stringify(value)
    : value;

  const metafieldInput = {
    ownerId: id,
    namespace,
    key,
    type,
    value: finalValue,
  };

  console.log("📝 metafieldsSet payload:", metafieldInput);

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
    success: errors.length === 0,
    errors,
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

function normalizeListValue(value) {
  if (Array.isArray(value)) return value;

  if (typeof value === "string") {
    try {
      if (value.trim().startsWith("[")) {
        return JSON.parse(value);
      }
      return value
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  return [];
}
