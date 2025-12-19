import prisma from "app/db.server";
import { authenticate } from "../shopify.server";

export async function action({ request }) {
  try {
    await authenticate.admin(request);

    console.log("API Remove DB Action Triggered");

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

    const { id, operation, myshopifyDomain, olderThanHours } = body;

    if (!id && !operation && !myshopifyDomain && !olderThanHours) {
      return {
        success: false,
        error: "No delete condition provided",
      };
    }

    const where: any = {};

    if (id) where.id = id;
    if (operation) where.operation = operation;
    if (myshopifyDomain) where.myshopifyDomain = myshopifyDomain;

    if (olderThanHours) {
      where.time = {
        lt: new Date(Date.now() - olderThanHours * 60 * 60 * 1000),
      };
    }

    const deleted = await prisma.database.deleteMany({ where });

    return {
      success: true,
      message: "Records deleted successfully",
      deletedCount: deleted.count,
    };
  } catch (error) {
    console.error("Remove DB Error:", error);
    return {
      success: false,
      error: error.message,
    };
  }
}
