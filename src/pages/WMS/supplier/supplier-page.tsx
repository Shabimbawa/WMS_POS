import { useState } from "react";
import {
  Button,
  Card,
  Empty,
  Flex,
  Segmented,
  Skeleton,
  Space,
  Typography,
} from "antd";

import { useSuppliers } from "../../../queries/useHooks";
import type { SupplierKind } from "../../../queries/types";
import { CreateSupplierButton } from "./create-supplier-button";
import { SupplierTable } from "./supplier-table";
import { useLanguage } from "../../../common/context/language-context";

export default function SupplierPage() {
  const { t } = useLanguage();
  const [kind, setKind] = useState<SupplierKind | undefined>();
  const {
    data: suppliers = [],
    isPending,
    isError,
    error,
    isFetching,
    refetch,
  } = useSuppliers(kind ? { kind } : {});

  return (
    <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          {t("Suppliers")}
        </Typography.Title>
        <Flex gap={8}>
          <Button onClick={() => refetch()} loading={isFetching}>
            Refresh
          </Button>
          <CreateSupplierButton />
        </Flex>
      </Flex>
      <Typography.Text type="secondary">
        {t("Maintain the suppliers used by international, national, and local receiving workflows. Use the supplier type to control where each company appears when shipments and deliveries are recorded.")}
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <Segmented
            value={kind}
            onChange={(v) => setKind(v as SupplierKind | undefined)}
            options={[
              { label: "All", value: undefined },
              { label: "International", value: "INTERNATIONAL" },
              { label: "National", value: "NATIONAL" },
              { label: "Local", value: "LOCAL" },
            ]}
          />
        </Flex>
      </Card>

      {isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : isError ? (
        <div style={{ color: "red" }}>
          Error loading suppliers: {(error as Error)?.message}
        </div>
      ) : suppliers.length === 0 ? (
        <Empty description="No suppliers" />
      ) : (
        <SupplierTable data={suppliers} onRefresh={() => refetch()} />
      )}
    </Space>
  );
}
