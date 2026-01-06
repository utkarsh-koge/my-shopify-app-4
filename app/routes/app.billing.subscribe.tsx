import { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { useEffect } from "react";
import {
    Page,
    Layout,
    Card,
    Text,
    Button,
    BlockStack,
    Box,
    Badge,
    Grid, InlineStack, List, Divider
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

export const PLANS = {
    BASIC: {
        name: "Basic",
        price: 10,
    },
    ADVANCED: {
        name: "Advanced",
        price: 25,
    },
} as const;

export type PlanKey = keyof typeof PLANS;

export async function loader({ request }: LoaderFunctionArgs) {
    const { session } = await authenticate.admin(request);
    const shopDomain = session.shop;

    const active = await prisma.activeSubscription.findUnique({
        where: { shopDomain },
        select: {
            plan: true,
            host: true,
        },
    });

    // Default to FREE if no active subscription
    const currentPlan = active?.plan ?? "FREE";
    const host = active?.host ?? null;

    return {
        currentPlan,
        host,
    };
}

export async function action({ request }: ActionFunctionArgs) {
    const { admin, session } = await authenticate.admin(request);
    const shop = session.shop;

    const formData = await request.formData();

    const host = formData.get("host") as string | null;
    if (!host) {
        throw new Response("Missing host parameter", { status: 400 });
    }

    const planKey = formData.get("plan") as PlanKey;
    const plan = PLANS[planKey];
    if (!plan) {
        throw new Response("Invalid plan", { status: 400 });
    }

    const returnUrl =
        `${process.env.SHOPIFY_APP_URL}/app` +
        `?shop=${shop}&host=${encodeURIComponent(host)}`;


    const graphqlResponse = await admin.graphql(
        `#graphql
      mutation CreateSubscription(
        $name: String!
        $returnUrl: URL!
        $test: Boolean!
        $amount: Decimal!
        $currency: CurrencyCode!
      ) {
        appSubscriptionCreate(
          name: $name
          returnUrl: $returnUrl
          test: $test
          lineItems: [{
            plan: {
              appRecurringPricingDetails: {
                price: { amount: $amount, currencyCode: $currency }
              }
            }
          }]
        ) {
          confirmationUrl
          userErrors {
            field
            message
          }
        }
      }
    `,
        {
            variables: {
                name: plan.name,
                returnUrl,
                test: true,
                amount: plan.price,
                currency: "USD",
            },
        }
    );

    const data = await graphqlResponse.json();
    const result = data.data?.appSubscriptionCreate;

    if (!result) {
        throw new Response("Billing error", { status: 500 });
    }

    if (result.userErrors?.length) {
        throw new Response(
            result.userErrors.map((e: any) => e.message).join(", "),
            { status: 400 }
        );
    }

    return { confirmationUrl: result.confirmationUrl };
}

// export default function BillingPage() {
//     const { currentPlan } = useLoaderData<typeof loader>();
//     const fetcher = useFetcher<typeof action>();

//     const host =
//         typeof window !== "undefined"
//             ? new URLSearchParams(window.location.search).get("host")
//             : null;

//     const handleSubscribe = (plan: string) => {
//         if (!host) return;
//         fetcher.submit(
//             { plan, host },
//             {
//                 method: "post",
//                 action: "/app/billing/subscribe",
//             }
//         );
//     };

//     useEffect(() => {
//         if (fetcher.data && "confirmationUrl" in fetcher.data) {
//             const url = (fetcher.data as { confirmationUrl: string }).confirmationUrl;
//             if (window.top) {
//                 window.top.location.href = url;
//             }
//         }
//     }, [fetcher.data]);

//     return (
//         <Page title="Subscription Plans" subtitle="Choose the best plan for your shop's growth.">
//             <Layout>
//                 <Layout.Section>
//                     <Grid>
//                         {/* ================= FREE PLAN ================= */}
//                         <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
//                             <Card>
//                                 <BlockStack gap="400">
//                                     <BlockStack gap="200">
//                                         <InlineStack align="space-between">
//                                             <Text as="h2" variant="headingLg">Free</Text>
//                                             {currentPlan === "FREE" && <Badge tone="success">Active</Badge>}
//                                         </InlineStack>
//                                         <Text as="p" variant="bodyLg" fontWeight="bold">$0 <Text as="span" variant="bodySm" tone="subdued">/ month</Text></Text>
//                                     </BlockStack>

//                                     <Divider />

//                                     <BlockStack gap="200">
//                                         <Text as="p" variant="bodyMd" fontWeight="medium">Monthly Limits:</Text>
//                                         <List type="bullet">
//                                             <List.Item>10 Tag Add/Removes</List.Item>
//                                             <List.Item>10 Metafield Updates</List.Item>
//                                             <List.Item>5 Global Actions</List.Item>
//                                             <List.Item>250 CSV Rows per action</List.Item>
//                                         </List>
//                                     </BlockStack>


//                                     <Box paddingTop="400">
//                                         {currentPlan === "FREE" && (
//                                             <Button
//                                                 fullWidth
//                                                 variant="secondary"
//                                                 disabled
//                                             >
//                                                 {currentPlan === "FREE" && "Current Plan"}
//                                             </Button>
//                                         )}
//                                     </Box>
//                                 </BlockStack>
//                             </Card>
//                         </Grid.Cell>

//                         {/* ================= BASIC PLAN ================= */}
//                         <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
//                             <Card>
//                                 <BlockStack gap="400">
//                                     <BlockStack gap="200">
//                                         <InlineStack align="space-between">
//                                             <Text as="h2" variant="headingLg">Basic</Text>
//                                             {currentPlan === "BASIC" && <Badge tone="success">Active</Badge>}
//                                         </InlineStack>
//                                         <Text as="p" variant="bodyLg" fontWeight="bold">$10 <Text as="span" variant="bodySm" tone="subdued">/ month</Text></Text>
//                                     </BlockStack>

//                                     <Divider />

//                                     <BlockStack gap="200">
//                                         <Text as="p" variant="bodyMd" fontWeight="medium">Increased Monthly Limits:</Text>
//                                         <List type="bullet">
//                                             <List.Item>50 Tag Add/Removes</List.Item>
//                                             <List.Item>50 Metafield Updates</List.Item>
//                                             <List.Item>25 Global Actions</List.Item>
//                                             <List.Item>1,500 CSV Rows per action</List.Item>
//                                         </List>
//                                     </BlockStack>

//                                     <Box paddingTop="400">
//                                         {currentPlan !== "ADVANCED" && (
//                                             <Button
//                                                 primary={currentPlan !== "BASIC"}
//                                                 fullWidth
//                                                 disabled={currentPlan === "BASIC"}
//                                                 onClick={() => handleSubscribe("BASIC")}
//                                                 loading={fetcher.state === "submitting" && fetcher.formData?.get("plan") === "BASIC"}
//                                             >
//                                                 {currentPlan === "BASIC" ? "Current Plan" : "Upgrade to Basic"}
//                                             </Button>
//                                         )}
//                                     </Box>
//                                 </BlockStack>
//                             </Card>
//                         </Grid.Cell>

//                         {/* ================= ADVANCED PLAN ================= */}
//                         <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
//                             {/* Highlighted Card for the Recommended Plan */}
//                             <Box background="bg-surface-secondary" borderRadius="300" padding="050">
//                                 <Card>
//                                     <BlockStack gap="400">
//                                         <BlockStack gap="200">
//                                             <InlineStack align="space-between">
//                                                 <Text as="h2" variant="headingLg">Advanced</Text>
//                                                 <Badge tone="attention">Best Value</Badge>
//                                             </InlineStack>
//                                             <Text as="p" variant="bodyLg" fontWeight="bold">$25 <Text as="span" variant="bodySm" tone="subdued">/ month</Text></Text>
//                                         </BlockStack>

//                                         <Divider />

//                                         <BlockStack gap="200">
//                                             <Text as="p" variant="bodyMd" fontWeight="medium">Everything Unlimited:</Text>
//                                             <div style={{ color: 'var(--p-color-text-success)' }}>
//                                                 <List type="bullet">
//                                                     <List.Item>Unlimited Tag Actions</List.Item>
//                                                     <List.Item>Unlimited Metafield Edits</List.Item>
//                                                     <List.Item>Unlimited Global Actions</List.Item>
//                                                     <List.Item>Full CSV Processing</List.Item>
//                                                     <List.Item>Priority Support</List.Item>
//                                                 </List>
//                                             </div>
//                                         </BlockStack>

//                                         <Box paddingTop="400">
//                                             <Button
//                                                 variant="primary"
//                                                 fullWidth
//                                                 disabled={currentPlan === "ADVANCED"}
//                                                 onClick={() => handleSubscribe("ADVANCED")}
//                                                 loading={fetcher.state === "submitting" && fetcher.formData?.get("plan") === "ADVANCED"}
//                                             >
//                                                 {currentPlan === "ADVANCED" ? "Current Plan" : "Upgrade to Advanced"}
//                                             </Button>
//                                         </Box>
//                                     </BlockStack>
//                                 </Card>
//                             </Box>
//                         </Grid.Cell>
//                     </Grid>
//                 </Layout.Section>
//             </Layout>
//         </Page>
//     );
// }

export default function BillingPage() {
    const { currentPlan, host } = useLoaderData<typeof loader>();
    const fetcher = useFetcher<typeof action>();

    const handleSubscribe = (plan: PlanKey) => {
        if (!host) return;

        fetcher.submit(
            { plan, host },
            {
                method: "post",
                action: "/app/billing/subscribe",
            }
        );
    };

    useEffect(() => {
        if (fetcher.data && "confirmationUrl" in fetcher.data) {
            const url = (fetcher.data as { confirmationUrl: string }).confirmationUrl;
            if (window.top) {
                window.top.location.href = url;
            }
        }
    }, [fetcher.data]);

    return (
        <Page title="Billing">
            <Layout>
                <Layout.Section>
                    <Grid>
                        {/* Free Plan */}
                        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                            <Card>
                                <BlockStack gap="400">
                                    <BlockStack gap="200">
                                        <Text as="h2" variant="headingMd">Free</Text>
                                        <Text as="p" variant="bodyMd">$0/month</Text>
                                        {currentPlan === "FREE" && (
                                            <Badge tone="success">Current Plan</Badge>
                                        )}
                                    </BlockStack>
                                    <Text as="p" tone="subdued">
                                        Standard features for getting started.
                                    </Text>
                                    <Button disabled variant="secondary">
                                        Active
                                    </Button>
                                </BlockStack>
                            </Card>
                        </Grid.Cell>

                        {/* Basic Plan */}
                        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                            <Card>
                                <BlockStack gap="400">
                                    <BlockStack gap="200">
                                        <Text as="h2" variant="headingMd">Basic</Text>
                                        <Text as="p" variant="bodyMd">$10/month</Text>
                                        {currentPlan === "BASIC" && (
                                            <Badge tone="success">Current Plan</Badge>
                                        )}
                                    </BlockStack>
                                    <Text as="p" tone="subdued">
                                        Enhanced features for growing shops.
                                    </Text>
                                    <Button
                                        variant="primary"
                                        onClick={() => handleSubscribe("BASIC")}
                                        loading={
                                            fetcher.state === "submitting" &&
                                            fetcher.formData?.get("plan") === "BASIC"
                                        }
                                    >
                                        Subscribe
                                    </Button>
                                </BlockStack>
                            </Card>
                        </Grid.Cell>

                        {/* Advanced Plan */}
                        <Grid.Cell columnSpan={{ xs: 6, sm: 6, md: 4, lg: 4, xl: 4 }}>
                            <Card>
                                <BlockStack gap="400">
                                    <BlockStack gap="200">
                                        <Text as="h2" variant="headingMd">Advanced</Text>
                                        <Text as="p" variant="bodyMd">$25/month</Text>
                                        {currentPlan === "ADVANCED" && (
                                            <Badge tone="success">Current Plan</Badge>
                                        )}
                                    </BlockStack>
                                    <Text as="p" tone="subdued">
                                        All features for high volume shops.
                                    </Text>
                                    <Button
                                        variant="primary"
                                        onClick={() => handleSubscribe("ADVANCED")}
                                        loading={
                                            fetcher.state === "submitting" &&
                                            fetcher.formData?.get("plan") === "ADVANCED"
                                        }
                                    >
                                        Subscribe
                                    </Button>
                                </BlockStack>
                            </Card>
                        </Grid.Cell>
                    </Grid>
                </Layout.Section>
            </Layout>
        </Page>
    );
}
