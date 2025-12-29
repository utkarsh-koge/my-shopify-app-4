import prisma from "../db.server";
import { authenticate } from "../shopify.server";

interface Body {
  operation?: string;
  value?: any;
  objectType?: string;
}

export async function action({ request }: { request: Request }) {
  try {
    let userName = "unknown@shop.com";
    let myshopifyDomain = "unknown.myshopify.com";

    try {
      const { admin } = await authenticate.admin(request);
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
      userName = shopJson?.data?.shop?.email || userName;
      myshopifyDomain = shopJson?.data?.shop?.myshopifyDomain || myshopifyDomain;
    } catch (authError) {
      console.error("Auth failed in api.add.db, proceeding with unknown user:", authError);
    }

    const raw = await request.text();
    let body: Body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return Response.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const { operation, value, objectType } = body;

    if (!operation || !value || !objectType) {
      return Response.json({ success: false, error: "Missing operation, value, or objectType" }, { status: 400 });
    }

    const savedRow = await prisma.database.create({
      data: {
        userName,
        operation,
        value,
        objectType,
        myshopifyDomain,
      },
    });

    return Response.json({
      success: true,
      message: "Data added successfully",
      id: savedRow.id,
    });
  } catch (error: any) {
    console.error("Add DB Error:", error);
    return Response.json({ success: false, error: error.message || "Unknown error" }, { status: 500 });
  }
}
