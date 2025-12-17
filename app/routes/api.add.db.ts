import prisma from "app/db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    // Authenticate Shopify Admin
    const { admin } = await authenticate.admin(request);

    console.log("API Add DB Action Triggered");

    // --- Fetch shop details (store email) ---
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
    const userName = shopJson?.data?.shop?.email || "unknown@shop.com";
    const myshopifyDomain = shopJson?.data?.shop?.myshopifyDomain || "unknown.myshopify.com";
    console.log("myshopifyDomain:", myshopifyDomain);
    // --- Parse body safely ---
    const raw = await request.text();
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch (parseError) {
      console.error("JSON Parse Error in api.add.db:", parseError);
      return {
        success: false,
        error: "Invalid JSON body",
      };
    }

    const { operation, value, objectType, } = body;

    if (!operation || !value) {
      return {
        success: false,
        error: "Missing operation or value in request body",
      };
    }

    console.log("Incoming Body:", body);

    // --- Cleanup old records (older than 24 hours) ---
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    try {
      const deleted = await prisma.database.deleteMany({
        where: {
          time: {
            lt: twentyFourHoursAgo,
          },
        },
      });
      console.log(`Deleted ${deleted.count} old records.`);
    } catch (cleanupError) {
      console.error("Cleanup Error (non-fatal):", cleanupError);
    }

    // --- Insert into DB ---
    const savedRow = await prisma.database.create({
      data: {
        userName, // shop email
        operation, // e.g., "Tags-removed"
        value, // JSON array with objects
        objectType,
        myshopifyDomain
        // time auto-filled by Prisma
      },
    });

    return {
      success: true,
      message: "Data saved successfully",
      id: savedRow.id,
    };
  } catch (error) {
    console.error("DB Insert Error:", error);

    return {
      success: false,
      error: error.message,
    };
  }
}
