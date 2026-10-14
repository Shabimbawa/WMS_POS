import { Button, Empty, Flex, Skeleton, Space, Typography } from "antd";

import { useShippingCompanies } from "../../../queries/useHooks";
import { CreateShippingCompanyButton } from "./create-shipping-company-button";
import { ShippingCompanyTable } from "./shipping-company-table";

export default function ShippingCompanyPage() {
  const {
    data: companies = [],
    isPending,
    isError,
    error,
    isFetching,
    refetch,
  } = useShippingCompanies();

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Shipping Companies
        </Typography.Title>
        <Flex gap={8}>
          <Button onClick={() => refetch()} loading={isFetching}>
            Refresh
          </Button>
          <CreateShippingCompanyButton />
        </Flex>
      </Flex>
      <Typography.Text type="secondary">
        Ocean carriers that move containers port to port. Deactivated companies
        stay on past containers but drop out of the dropdown.
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
