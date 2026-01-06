import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const body = await request.json();

    const { plan, updates } = body as {
        plan: "FREE" | "BASIC";
        updates: Partial<{
            tagAdd: number;
            tagRemove: number;
            tagGlobal: number;
            tagSpecific: number;

            metaUpdate: number;
            metaRemove: number;
            metaGlobal: number;

            tagAddCsvLimit: number;
            tagRemoveCsvLimit: number;
            metaUpdateCsvLimit: number;
            metaRemoveCsvLimit: number;
        }>;
    };

    if (!plan || !updates || Object.keys(updates).length === 0) {
        throw new Error("Plan and update fields are required");
    }

    let updated;

    if (plan === "FREE") {
        updated = await prisma.freePlanLimits.update({
            where: { shopDomain },
            data: updates,
        });
    }

    if (plan === "BASIC") {
        updated = await prisma.basicPlanLimits.update({
            where: { shopDomain },
            data: updates,
        });
    }

    if (!updated) {
        throw new Error("Invalid plan");
    }

    // const planData = {
    //     plan,
    //     limits: updated,
    // };

    return true;
};
