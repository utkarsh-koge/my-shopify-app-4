import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { LoaderFunctionArgs } from "react-router";

export async function loader({ request }: LoaderFunctionArgs) {
    // 1️⃣ Authenticate admin session
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    // 2️⃣ Reset popup flag
    await prisma.activeSubscription.update({
        where: { shopDomain },
        data: { popupShown: false },
    });

    return new Response("Popup reset successfully", { status: 200 });
}
