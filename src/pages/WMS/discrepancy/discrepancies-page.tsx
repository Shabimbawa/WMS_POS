import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Card,
  Empty,
  Flex,
  Pagination,
  Segmented,
  Skeleton,
  Space,
  Switch,
  Typography,
} from "antd";

import {
  useContainerVariance,
  useOpenQuestionCount,
  useOpenQuestions,
} from "../../../queries/useHooks";
import { OpenQuestionsTable, VarianceTable } from "./discrepancies-table";

type View = "variance" | "questions";

export default function DiscrepanciesPage() {

  const [view, setView] = useState<View>("variance");
  const [mismatchOnly, setMismatchOnly] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Only the active view's query runs.
  const variance = useContainerVariance(
    { page, pageSize, mismatchOnly },
    view === "variance",
  );
  const questions = useOpenQuestions({ page, pageSize }, view === "questions");
  const { data: questionCount } = useOpenQuestionCount();
  const active = view === "variance" ? variance : questions;

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

  return (
    <Space direction="vertical" size="middle" style={{ width: "100%" }}>
      <Flex justify="space-between" align="center">
        <Typography.Title level={4} style={{ margin: 0 }}>
          Discrepancies
        </Typography.Title>
        <Button onClick={() => active.refetch()} loading={active.isFetching}>
          Refresh
        </Button>
      </Flex>
      <Typography.Text type="secondary">
        {view === "variance"
          ? "Declared vs counted sacks per unloaded container. Negative variance is a shortfall."
          : "Issues logged as Other. They change no quantities and stay here until re-logged under a real reason."}
      </Typography.Text>

      <Card size="small">
        <Flex wrap gap={12} align="center">
          <Segmented
            value={view}
            onChange={(v) => reset(setView)(v as View)}
            options={[
              { label: "Variance", value: "variance" },
              {
                label: (
                  <Flex align="center" gap={6}>
                    Open questions
                    <Badge count={questionCount} size="small" />
                  </Flex>
                ),
                value: "questions",
              },
            ]}
          />
          {view === "variance" && (
            <Flex align="center" gap={8}>
              <Switch
                size="small"
                checked={mismatchOnly}
                onChange={reset(setMismatchOnly)}
              />
              <Typography.Text>Mismatches only</Typography.Text>
            </Flex>
          )}
        </Flex>
      </Card>

      {active.isError ? (
        <Alert
          type="error"
          showIcon
          message="Could not load discrepancies"
          description={(active.error as Error)?.message}
        />
      ) : active.isPending ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : !active.data?.rows.length ? (
        <Empty
          description={
            view === "variance"
              ? "No unloaded containers with a variance"
              : "No open questions"
          }
        />
      ) : (
        <div style={{ opacity: active.isPlaceholderData ? 0.6 : 1 }}>
          {view === "variance" && variance.data ? (
            <VarianceTable data={variance.data.rows} />
          ) : questions.data ? (
            <OpenQuestionsTable data={questions.data.rows} />
          ) : null}
          <Flex justify="end" style={{ marginTop: 12 }}>
            <Pagination
              current={active.data.page}
              pageSize={active.data.pageSize}
              total={active.data.total}
              showSizeChanger
              pageSizeOptions={[10, 25, 50, 100]}
              onChange={(p, ps) => {
                setPage(p);
                setPageSize(ps);
              }}
              showTotal={(t, r) => `${r[0]}–${r[1]} of ${t}`}
            />
          </Flex>
        </div>
      )}
    </Space>
  );
}
