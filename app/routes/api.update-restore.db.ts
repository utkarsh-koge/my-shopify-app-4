import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs } from "react-router";

export async function action({ request }: ActionFunctionArgs) {
  try {
    const formData = await request.formData();
    const metaobjectId = formData.get("rowId"); // expecting metaobject ID
    console.log("metaobjectId", metaobjectId);

    if (!metaobjectId) {
      return { success: false, message: "Missing metaobject id" };
    }
    const { admin } = await authenticate.admin(request);

    const mutation = `
      mutation UpdateMetaobjectRestore($id: ID!, $metaobject: MetaobjectUpdateInput!) {
  metaobjectUpdate(id: $id, metaobject: $metaobject) {
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
    `;

    const variables = {
      id: metaobjectId,
      metaobject: { fields: [{ key: "restore", value: "false" }] },
    };

    const response = await admin.graphql(mutation, { variables });
    const data: any = await response.json();

    return { success: true, updated: data?.metaobjectUpdate?.metaobject };
  } catch (err: any) {
    console.error("Restore update error:", err);
    return {
      success: false,
      message: "Internal server error",
      error: err.message,
    };
  }
}
