import { Button, Empty, Flex, Skeleton, Space, Typography } from "antd";

import { useShippingCompanies } from "../../../queries/useHooks";
import { CreateShippingCompanyButton } from "./create-shipping-company-button";
import { ShippingCompanyTable } from "./shipping-company-table";
import { useLanguage } from "../../../common/context/language-context";

export default function ShippingCompanyPage() {
  const { t } = useLanguage();
  const {
    data: companies = [],
    isPending,
    isError,
    error,
    isFetching,
    refetch,
  } = useShippingCompanies();

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t("Shipping Companies")}
        </Typography.Title>
        <Flex gap={8}>
          <Button onClick={() => refetch()} loading={isFetching}>
            Refresh
          </Button>
          <CreateShippingCompanyButton />
        </Flex>
      </Flex>
      <Typography.Text type="secondary">
        {t("Manage the ocean carriers assigned to international containers. Deactivated companies remain visible on historical shipments but are removed from the choices for new records.")}
      </Typography.Text>

      {isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : isError ? (
        <div style={{ color: "red" }}>
          Error loading shipping companies: {(error as Error)?.message}
        </div>
      ) : companies.length === 0 ? (
        <Empty description="No shipping companies" />
      ) : (
        <ShippingCompanyTable data={companies} onRefresh={() => refetch()} />
      )}
    </Space>
  );
}
