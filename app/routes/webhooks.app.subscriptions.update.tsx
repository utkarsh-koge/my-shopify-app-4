import { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

type PlanType = "FREE" | "BASIC" | "ADVANCED";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { shop, admin, payload } = await authenticate.webhook(request);

    const dbActive = await prisma.activeSubscription.findUnique({
        where: { shopDomain: shop },
    });

    let shopifySub: {
        id: string;
        name: string;
        status: string;
        currentPeriodEnd?: string;
    } | null = null;

    try {
        const response = await admin.graphql(`
      query {
        currentAppInstallation {
          activeSubscriptions {
            id
            name
            status
            currentPeriodEnd
          }
        }
      }
    `);

        const data = await response.json();
        const activeSubs =
            data?.data?.currentAppInstallation?.activeSubscriptions ?? [];

        if (activeSubs.length > 0) {
            shopifySub = activeSubs[0]; // Shopify guarantees ONE active
        }
    } catch (err) {
        console.error("ActiveSubscriptions API failed", err);
        return new Response("OK");
    }

    let finalPlan: PlanType = "FREE";
    let finalSubscriptionId: string | null = null;

    if (shopifySub && shopifySub.status === "ACTIVE") {
        switch (shopifySub.name) {
            case "Basic":
                finalPlan = "BASIC";
                break;
            case "Advanced":
                finalPlan = "ADVANCED";
                break;
            default:
                finalPlan = "FREE";
        }

        finalSubscriptionId = shopifySub.id;
    }

    const previousPlan: PlanType = dbActive?.plan ?? "FREE";
    const previousSubscriptionId = dbActive?.subscriptionId ?? null;

    const hasChanged = previousPlan !== finalPlan || previousSubscriptionId !== finalSubscriptionId;

    if (!hasChanged) {
        return new Response("OK");
    }

    await prisma.activeSubscription.update({
        where: { shopDomain: shop },
        data: {
            plan: finalPlan,
            subscriptionId: finalSubscriptionId,
            popupShown: true,
        },
    });

    const eventStatus = payload?.app_subscription?.status === "ACTIVE" ? "UPGRADED" : "CANCELLED"
    const plan = payload?.app_subscription?.name === "Basic" ? "BASIC" : "ADVANCED"
    const subscriptionId = payload?.app_subscription?.admin_graphql_api_id

    await prisma.subscriptionHistory.create({
        data: {
            shopDomain: shop,
            plan: plan,
            subscriptionId: subscriptionId,
            status: eventStatus,
        },
    });

    return new Response("OK");
};
