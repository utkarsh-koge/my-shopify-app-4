import prisma from "app/db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    const { admin } = await authenticate.admin(request);

    console.log("API Add DB Action Triggered");

    const shopQuery = `
      query {
        shop {
          email
          myshopifyDomain
          primaryDomain {
            url
            host
          }
        }
      }
    `;

    const shopRes = await admin.graphql(shopQuery);
    const shopJson = await shopRes.json();

    const userName =
      shopJson?.data?.shop?.email || "unknown@shop.com";
    const myshopifyDomain =
      shopJson?.data?.shop?.myshopifyDomain || "unknown.myshopify.com";

    const raw = await request.text();
    let body = {};

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return {
        success: false,
        error: "Invalid JSON body",
      };
    }

    const { operation, value, objectType } = body;

    if (!operation || !value || !objectType) {
      return {
        success: false,
        error: "Missing operation, value, or objectType",
      };
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

    return {
      success: true,
      message: "Data added successfully",
      id: savedRow.id,
    };
  } catch (error) {
    console.error("Add DB Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
