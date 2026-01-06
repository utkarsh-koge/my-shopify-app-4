import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { LoaderFunctionArgs } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    /* 1️⃣ Fetch active subscription */
    let dbActive = await prisma.activeSubscription.findUnique({
        where: { shopDomain },
        select: {
            popupShown: true,
        },
    });

    /* 2️⃣ First install → create records */
    if (!dbActive) {
        await prisma.activeSubscription.create({
            data: {
                shopDomain,
                plan: "FREE",
                subscriptionId: "free",
                popupShown: false,
            },
        });

        await prisma.subscriptionHistory.create({
            data: {
                shopDomain,
                plan: "FREE",
                subscriptionId: "free",
                status: "CREATED",
            },
        });

        return {
            showPopup: false,
        };
    }

    /* 3️⃣ Existing shop → return popup flag */
    return {
        showPopup: dbActive?.popupShown,
    };
};
