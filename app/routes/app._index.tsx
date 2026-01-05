import { useNavigate, useFetcher, useOutletContext } from "react-router";
import { useEffect, useState } from "react";
import {
  Page,
  Layout,
  Card,
  Text,
  BlockStack,
  InlineGrid,
  Banner,
  Icon,
  Button,
  Box,
  Modal,
  InlineStack,
  Badge,
} from "@shopify/polaris";
import {
  DiscountIcon,
  DeleteIcon,
  DatabaseIcon,
  QuestionCircleIcon,
  ClockIcon,
  CreditCardIcon,
} from "@shopify/polaris-icons";
type AppOutletContext = {
  planData: any;
};

export default function HomePage() {
  const navigate = useNavigate();
  const fetcher = useFetcher();
  const { planData } = useOutletContext<AppOutletContext>();

  const modules = [
    {
      title: "Add Tags",
      desc: "Quickly append multiple tags to products, customers, blogposts, or orders using a simple CSV identifier list.",
      route: "/app/add-tags",
      icon: DiscountIcon,
      action: "Add Tags",
      tone: "success",
    },
    {
      title: "Remove Tags",
      desc: "Search for tags by condition and remove them from your entire store or specific items via CSV upload.",
      route: "/app/remove-tags",
      icon: DeleteIcon,
      action: "Remove Tags",
      tone: "critical",
    },
    {
      title: "Metafield Manager",
      desc: "Manage metafield definitions and values. Clear data globally or perform bulk updates using CSV files.",
      route: "/app/metafield-manage",
      icon: DatabaseIcon,
      action: "Manage Metafields",
      tone: "highlight",
    },
  ];

  const [active, setActive] = useState(false);
  const handleClose = () => {
    setActive(false);
    fetcher.load("/api/closePopup/subscription");
  };

  useEffect(() => {
    fetcher.load("/api/checkPopup/subscription");
  }, []);

  useEffect(() => {
    if (fetcher.data && (fetcher.data as any).showPopup) {
      setActive(true);
    }
  }, [fetcher.data]);

  return (
    <Page
      title="Tag Metafield Manager"
      subtitle="The all-in-one toolkit for bulk store data manipulation."
      secondaryActions={[
        {
          content: "History",
          icon: ClockIcon,
          onAction: () => navigate("/app/history"),
        },
        {
          content: "FAQ",
          icon: QuestionCircleIcon,
          onAction: () => navigate("/app/faq"),
        },
      ]}
    >
      <BlockStack gap="500">
        {/* Modal for updates */}
        <Modal
          open={active}
          onClose={handleClose}
          title=""
          primaryAction={{
            content: "Close",
            onAction: handleClose,
          }}
        >
          <Modal.Section>
            <BlockStack gap="300" align="center">

              {/* Celebration Emoji */}
              <Text as="span" variant="heading2xl">
                🎉
              </Text>

              <Text variant="headingMd" as="h2" textAlign="center">
                Plan Upgraded
              </Text>

              <Text variant="bodyMd" tone="subdued" textAlign="center">
                Your subscription has been successfully updated.
              </Text>

            </BlockStack>
          </Modal.Section>
        </Modal>

        {/* HIGH VISIBILITY SUBSCRIPTION SECTION */}
        <Card padding="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <InlineStack gap="200" align="start">
                <Text variant="headingMd" as="h2">
                  Current Subscription
                </Text>
                <Badge tone="attention">
                  {planData?.plan}
                </Badge>
              </InlineStack>

              <Text tone="subdued" as="p">
                Your plan controls how many actions you can perform.
              </Text>
            </BlockStack>

            <Button
              variant="primary"
              icon={CreditCardIcon}
              onClick={() => navigate("/app/billing/subscribe")}
            >
              Manage Subscription
            </Button>
          </InlineStack>
        </Card>

        {/* MODULE GRID */}
        <Layout>
          <Layout.Section>
            <InlineGrid columns={{ xs: 1, md: 3 }} gap="400">
              {modules.map((module, index) => (
                <Card key={index} roundedAbove="sm">
                  <BlockStack gap="400">
                    <Box
                      background="bg-surface-secondary"
                      padding="300"
                      borderRadius="200"
                      width="40px"
                    >
                      <Icon source={module.icon} tone={module.tone as any} />
                    </Box>

                    <BlockStack gap="200">
                      <Text as="h2" variant="headingMd">
                        {module.title}
                      </Text>
                      <Box minHeight="64px">
                        <Text as="p" variant="bodyMd" tone="subdued">
                          {module.desc}
                        </Text>
                      </Box>
                    </BlockStack>

                    <Button
                      onClick={() => navigate(module.route)}
                      variant="primary"
                      fullWidth
                    >
                      {module.action}
                    </Button>
                  </BlockStack>
                </Card>
              ))}
            </InlineGrid>
          </Layout.Section>

          {/* LOWER BANNER */}
          <Layout.Section>
            <Banner
              title="Export your store data"
              tone="info"
              action={{
                content: "Export Data",
                onAction: () => navigate("/app/export-data"),
              }}
            >
              <p>
                Export your store data as CSV to review and prepare changes before running any operation.
              </p>
            </Banner>
          </Layout.Section>

        </Layout>
      </BlockStack>
    </Page>
  );
}