import { authenticate } from "../shopify.server";
import { fetchResourceId as fetchMetaResourceID, getMetaobjectIdFromMetafield } from "app/functions/metafield-manage-action";
import { fetchResourceId as fetchTagResourceID } from "app/functions/remove-tag-action";

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

      function normalizeListValue(input) {
        if (!input) return [];

        // Already an array
        if (Array.isArray(input)) {
          return input.map((v) => String(v).trim()).filter(Boolean);
        }

        // String input
        if (typeof input === "string") {
          const trimmed = input.trim();

          // JSON array string: ["a","b"]
          if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            try {
              const parsed = JSON.parse(trimmed);
              return Array.isArray(parsed)
                ? parsed.map((v) => String(v).trim()).filter(Boolean)
                : [];
            } catch {
              return [];
            }
          }

          // CSV string: a, b, c
          return trimmed
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
        }

        return [];
      }

      if (row.operation === "Metafield-removed") {
        // 🔹 LIST TYPE → MERGE + RESTORE
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
            objectType
          );

          return Response.json(
            result.success
              ? { success: true }
              : { success: false, errors: result.errors },
          );
        }

        // 🔹 NON-LIST TYPE → DIRECT SET
        const result = await updateSpecificMetafield(
          admin,
          resolvedId,
          namespace,
          key,
          value,
          metafieldType,
          objectType
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
            key
          );

          if (!existingRaw) {
            return Response.json({ success: true });
          }

          const existingList = normalizeListValue(existingRaw);
          const removeList = normalizeListValue(value);

          //  🔑 NORMALIZE REMOVE LIST → IDS (for metaobject refs)
          const isMetaobjectList = metafieldType === "list.metaobject_reference";
          let resolvedRemoveList = removeList;

          if (isMetaobjectList) {
            resolvedRemoveList = [];

            for (const item of removeList) {
              // Already an ID
              if (
                typeof item === "string" &&
                item.startsWith("gid://shopify/Metaobject/")
              ) {
                resolvedRemoveList.push(item);
              } else {
                // Handle → ID
                const resolved = await getMetaobjectIdFromMetafield(admin, {
                  namespace,
                  key,
                  objectType,
                  metaobjectHandle: item,
                });

                if (!resolved) {
                  return Response.json({
                    success: false,
                    errors: [{ message: `Metaobject not found: ${item}` }],
                  });
                }

                resolvedRemoveList.push(resolved);
              }
            }
          }

          // console.log("📦 EXISTING LIST:", existingList);
          // console.log("🗑️ REMOVE LIST (normalized):", resolvedRemoveList);

          //  🔥 FILTER
          const updatedList = existingList.filter(
            (v) => !resolvedRemoveList.includes(v)
          );

          //  🧹 EMPTY → DELETE METAFIELD
          if (updatedList.length === 0) {
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
              }
            );

            const delJson = await delRes.json();
            const errors = delJson?.data?.metafieldsDelete?.userErrors || [];

            if (errors.length) {
              return Response.json({ success: false, errors });
            }

            return Response.json({ success: true });
          }

          //  ✍️ UPDATE METAFIELD
          const result = await updateSpecificMetafield(
            admin,
            resolvedId,
            namespace,
            key,
            JSON.stringify(updatedList),
            metafieldType,
            objectType
          );

          return Response.json(
            result.success
              ? { success: true }
              : { success: false, errors: result.errors }
          );
        }

        //  🧹 NON-LIST → DELETE METAFIELD
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
          }
        );

        const delJson = await delRes.json();
        const errors = delJson?.data?.metafieldsDelete?.userErrors || [];

        if (errors.length) {
          return Response.json({ success: false, errors });
        }

        return Response.json({ success: true });
      }

    }

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
  objectType // REQUIRED for resolving metaobject definition
) {
  const type =
    typeof metafieldType === "string"
      ? metafieldType
      : metafieldType?.name;

  if (!type) {
    return {
      success: false,
      errors: [{ message: "Missing metafield type" }],
    };
  }

  console.log("▶️ INPUT", { id, namespace, key, value, type });

  //  HELPERS

  const isMetaobjectId = (v) =>
    typeof v === "string" &&
    /^gid:\/\/shopify\/Metaobject\/\d+$/.test(v.trim());

  async function resolveMetaobjectValue(raw) {
    if (!raw) return null;
    if (isMetaobjectId(raw)) return raw;

    return await getMetaobjectIdFromMetafield(admin, {
      namespace,
      key,
      objectType,
      metaobjectHandle: raw,
    });
  }

  //  NORMALIZE VALUE

  let finalValue = value;

  /* ---------- SINGLE METAOBJECT REFERENCE ---------- */
  if (type === "metaobject_reference") {
    const resolvedId = await resolveMetaobjectValue(value);

    if (!resolvedId) {
      return {
        success: false,
        errors: [{ message: `Metaobject not found: ${value}` }],
      };
    }

    finalValue = resolvedId;
  }

  /* ---------- LIST METAOBJECT REFERENCE ---------- */
  else if (type === "list.metaobject_reference") {
    let list;

    if (Array.isArray(value)) {
      list = value;
    } else if (typeof value === "string" && value.trim().startsWith("[")) {
      try {
        list = JSON.parse(value);
      } catch {
        return {
          success: false,
          errors: [{ message: "Invalid JSON for list.metaobject_reference" }],
        };
      }
    } else if (typeof value === "string") {
      list = value.split(",").map(v => v.trim()).filter(Boolean);
    }

    if (!Array.isArray(list)) {
      return {
        success: false,
        errors: [{ message: "Invalid list.metaobject_reference value" }],
      };
    }

    const resolvedIds = [];

    for (const item of list) {
      const resolved = await resolveMetaobjectValue(item);
      if (!resolved) {
        return {
          success: false,
          errors: [{ message: `Metaobject not found: ${item}` }],
        };
      }
      resolvedIds.push(resolved);
    }

    finalValue = JSON.stringify(resolvedIds);
  }

  /* ---------- OTHER LIST TYPES ---------- */
  else if (type.startsWith("list.")) {
    finalValue =
      typeof value === "string"
        ? value
        : JSON.stringify(value);
  }

  /* ---------- SCALAR TYPES ---------- */
  else {
    finalValue =
      value === null || value === undefined ? "" : String(value);
  }

  //  METAFIELD SET
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
