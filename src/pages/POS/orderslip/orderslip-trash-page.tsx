import { useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Empty,
  Flex,
  Input,
  Pagination,
  Popconfirm,
  Skeleton,
  Space,
  Typography,
  message,
} from "antd";
import { ArrowLeftOutlined, DeleteOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

import { ErrorNotificationPopup } from "../../../common/items/notification/errror-notif";
import { useEmptyOrderSlipTrash, useOrderSlipTrash } from "../../../queries/useHooks";
import { OrderSlipTrashTable } from "./orderslip-trash-table";

export default function OrderSlipTrashPage() {
  const navigate = useNavigate();
  const [msg, msgHolder] = message.useMessage();
  const { showError, contextHolder } = ErrorNotificationPopup();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const params = useMemo(
    () => ({ search: search.trim() || undefined, page, pageSize }),
    [search, page, pageSize],
  );
  const { data, isPending, isError, error, isPlaceholderData } = useOrderSlipTrash(params);
  const empty = useEmptyOrderSlipTrash();
  const notify = { success: (text: string) => void msg.success(text), error: showError };

  const emptyTrash = async () => {
    try {
      const purged = await empty.mutateAsync();
      msg.success(`Deleted ${purged} order ${purged === 1 ? "slip" : "slips"} permanently`);
      setPage(1);
    } catch (e) {
      showError(e, "Could not empty Trash");
    }
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      {msgHolder}
      {contextHolder}
      <Flex justify="space-between" align="center" wrap gap={12}>
        <Typography.Title level={4} style={{ margin: 0 }}>Trash</Typography.Title>
        <Flex gap={8}>
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/order-slip")}>
            Back to order slips
          </Button>
          <Popconfirm
            title="Empty Trash?"
            description="Every slip in Trash is deleted permanently and can't be restored."
            okText="Empty Trash"
            okButtonProps={{ danger: true }}
            onConfirm={emptyTrash}
            disabled={!data?.total}
          >
            <Button danger icon={<DeleteOutlined />} loading={empty.isPending} disabled={!data?.total}>
              Empty Trash
            </Button>
          </Popconfirm>
        </Flex>
      </Flex>
      <Typography.Text type="secondary">
        Deleted order slips stay here for 30 days, then are deleted permanently. Their
        sacks were returned to stock when they were deleted; restoring a slip deducts them again.
      </Typography.Text>

      <Card size="small">
        <Input.Search
          allowClear
          placeholder="Search customer, cashier or slip no."
          style={{ width: 300 }}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </Card>

      {isError ? (
        <Alert type="error" showIcon message="Could not load Trash" description={(error as Error).message} />
      ) : isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !data?.rows.length ? (
        <Empty description={search.trim() ? "No deleted slips match your search" : "Trash is empty"} />
      ) : (
        <div style={{ opacity: isPlaceholderData ? 0.6 : 1 }}>
          <OrderSlipTrashTable data={data.rows} notify={notify} />
          <Flex justify="end" style={{ marginTop: 12 }}>
            <Pagination
              current={data.page}
              pageSize={data.pageSize}
              total={data.total}
              showSizeChanger
              pageSizeOptions={[10, 25, 50, 100]}
              onChange={(nextPage, nextPageSize) => {
                setPage(nextPageSize !== pageSize ? 1 : nextPage);
                setPageSize(nextPageSize);
              }}
              showTotal={(total, bounds) => `${bounds[0]}–${bounds[1]} of ${total}`}
            />
          </Flex>
        </div>
      )}
    </Space>
  );
}
