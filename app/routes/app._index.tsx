import { useNavigate } from "react-router";
import {
  Page,
  Layout,
  LegacyCard,
  Text,
  BlockStack,
  InlineGrid,
  Banner,
  Icon,
  Button,
  Box,
} from "@shopify/polaris";
import {
  DiscountIcon,
  DeleteIcon,
  DatabaseIcon,
  QuestionCircleIcon,
  ClockIcon,
} from "@shopify/polaris-icons";

export default function HomePage() {
  const navigate = useNavigate();

  const modules = [
    {
      title: "Add Tags",
      desc: "Quickly append multiple tags to products, customers, or orders using a simple CSV identifier list.",
      route: "/app/add-tags",
      icon: DiscountIcon,
      action: "Add Tags",
    },
    {
      title: "Remove Tags",
      desc: "Search for tags by condition and remove them from your entire store or specific items via CSV upload.",
      route: "/app/remove-tags",
      icon: DeleteIcon,
      action: "Remove Tags",
    },
    {
      title: "Metafield Manager",
      desc: "Manage metafield definitions and values. Clear data globally or perform bulk updates using CSV files.",
      route: "/app/metafield-manage",
      icon: DatabaseIcon,
      action: "Manage Metafields",
    },
  ];

  return (
    <Page
      title="Tag MetaField Manager"
      subtitle="Select a module to begin managing your store data."
      secondaryActions={[
        {
          content: "FAQ",
          icon: QuestionCircleIcon,
          onAction: () => navigate("/app/faq"),
        },
        {
          content: "History",
          icon: ClockIcon,
          onAction: () => navigate("/app/history"),
        },
      ]}
    >
      <BlockStack gap="600">
        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ sm: 1, md: 2, lg: 3 }} gap="400">
              {modules.map((module, index) => (
                /* Use a Box with height 100% to ensure cards stretch equally */
                <Box key={index} height="100%">
                  <LegacyCard title={module.title} sectioned>
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        height: "100%",
                        minHeight: "200px", // Ensures consistency even with short text
                      }}
                    >
                      <BlockStack gap="400">
                        <div style={{ color: "var(--p-icon-subdued)" }}>
                          <Icon source={module.icon} tone="base" />
                        </div>
                        {/* Fixed height for description area ensures the buttons align */}
                        <div style={{ minHeight: "80px" }}>
                          <Text as="p" variant="bodyMd" tone="subdued">
                            {module.desc}
                          </Text>
                        </div>
                      </BlockStack>

                      <div style={{ marginTop: "16px" }}>
                        <Button
                          onClick={() => navigate(module.route)}
                          variant="primary"
                          fullWidth
                        >
                          {module.action}
                        </Button>
                      </div>
                    </div>
                  </LegacyCard>
                </Box>
              ))}
            </InlineGrid>
          </Layout.Section>

          <Layout.Section>
            <Banner title="Safe Operations Guaranteed" tone="info">
              <p>
                Every bulk action is recorded and can be reverted within 24
                hours.{" "}
                <Button
                  variant="plain"
                  onClick={() => navigate("/app/history")}
                >
                  View Recent Activity
                </Button>
              </p>
            </Banner>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}