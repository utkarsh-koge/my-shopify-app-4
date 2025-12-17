import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    // Authenticate and get shop info
    const { session } = await authenticate.admin(request);

    const shopDomain = session.shop; // e.g. "abc.myshopify.com"

    // Fetch only logs for this shop
    const logs = await prisma.database.findMany({
      where: {
        myshopifyDomain: shopDomain,
      },
      orderBy: {
        time: "desc",
      },
    });

    console.log("Fetched logs for shop:", shopDomain, logs);

    return { logs, shopDomain };
  } catch (err: any) {
    console.error("Loader error:", err);

    return {
      success: false,
      error: err.message || "Failed to load logs.",
      logs: [],
    };
  }
};
