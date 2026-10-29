import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef,
  type TableOptions,
  type TableMeta,
  type VisibilityState,
  type RowData,
} from '@tanstack/react-table'

import { ConfigProvider, Table } from 'antd'
import { useState, type Key, type ReactNode } from 'react'
import { useLanguage } from '../../context/language-context'

declare module '@tanstack/react-table' {
  // The type parameters must match TanStack's declaration exactly for the
  // interfaces to merge, even though this augmentation never uses them.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /**
     * Pins the column to an edge while the rest scroll horizontally, via antd's
     * sticky columns. Pinned columns must be contiguous at that edge — a
     * non-pinned column to their outside would scroll out from under them and
     * leave a gap where it was.
     */
    fixed?: 'left' | 'right'
  }
}

interface DataTableProps<TData> {
  data: TData[]
  columns: ColumnDef<TData, any>[]
  tableOptions?: Partial<TableOptions<TData>>
  meta?: TableMeta<TData>
  columnVisibility?: VisibilityState
  /**
   * Makes rows expandable, rendering this beneath the row when opened.
   * Return null for rows with nothing to show and they get no expand toggle.
   */
  renderExpanded?: (row: TData) => ReactNode
  /**
   * Controls which rows are open (row IDs, the row index unless getRowId says
   * otherwise), e.g. so the page can close them all. Uncontrolled when omitted.
   */
  expandedRowKeys?: Key[]
  onExpandedRowKeysChange?: (keys: Key[]) => void
}

export function DataTable<TData>({
  data,
  columns,
  tableOptions,
  meta,
  columnVisibility,
  renderExpanded,
  expandedRowKeys: controlledKeys,
  onExpandedRowKeysChange,
}: DataTableProps<TData>) {
  const { t } = useLanguage()
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    meta,
    state: {
      columnVisibility,
    },
    ...tableOptions,
  })


  const antdColumns = table.getHeaderGroups()[0]?.headers.map((header) => ({
    key: header.id,
    title: header.isPlaceholder
      ? null
      : typeof header.column.columnDef.header === 'string'
        ? t(header.column.columnDef.header)
        : flexRender(header.column.columnDef.header, header.getContext()),
    dataIndex: header.id,
    width: header.column.columnDef.size,
    fixed: header.column.columnDef.meta?.fixed,
    render: (_: unknown, _record: unknown, index: number) => {
      const row = table.getRowModel().rows[index]
      const cell = row?.getVisibleCells().find((c) => c.column.id === header.id)
      return cell
        ? flexRender(cell.column.columnDef.cell, cell.getContext())
        : null
    },
  })) || []

  const antdData = table.getRowModel().rows.map((row, _index) => ({
    key: row.id,
    ...Object.fromEntries(
      row.getVisibleCells().map((cell) => [cell.column.id, cell.getValue()])
    ),
  }))

  const rowsById = new Map(table.getRowModel().rows.map((r) => [r.id, r]))

  const [ownKeys, setOwnKeys] = useState<Key[]>([])
  const expandedRowKeys = controlledKeys ?? ownKeys
  const toggleRow = (key: Key, open = !expandedRowKeys.includes(key)) => {
    const next = open
      ? expandedRowKeys.includes(key) ? expandedRowKeys : [...expandedRowKeys, key]
      : expandedRowKeys.filter((k) => k !== key)
    if (onExpandedRowKeysChange) onExpandedRowKeysChange(next)
    else setOwnKeys(next)
  }

  const rowExpandable = (record: { key: string }) => {
    const row = rowsById.get(record.key)
    return !!row && !!renderExpanded && renderExpanded(row.original) !== null
  }

  const expandable = renderExpanded && {
    expandedRowKeys,
    onExpand: (expanded: boolean, record: { key: string }) =>
      toggleRow(record.key, expanded),
    expandedRowRender: (record: { key: string }) => {
      const row = rowsById.get(record.key)
      return row ? renderExpanded(row.original) : null
    },
    rowExpandable,
  }

  return (
    <ConfigProvider
      theme={{
        components: {
        Table: {
            cellPaddingBlock: 5,
            cellPaddingInline: 12,
          },
        },
      }}
    >
      <Table
        columns={antdColumns}
        dataSource={antdData}
        expandable={expandable || undefined}
        pagination={false}
        bordered={false}
        scroll={{ x: 'max-content' }}
        style={{ width: '100%' }}
        onRow={
          renderExpanded
            ? (record) => ({
                style: { cursor: 'pointer' },
                onClick: (event) => {
                  const target = event.target as HTMLElement
                  // Action buttons and the expand icon keep their own click.
                  if (
                    target.closest(
                      'button, a, input, select, textarea, [role="button"]',
                    )
                  ) {
                    return
                  }
                  // Selecting text should not toggle the row.
                  const selection = window.getSelection()
                  if (selection && selection.toString()) return
                  if (!rowExpandable(record)) return
                  toggleRow(record.key)
                },
              })
            : undefined
        }
      />
     </ConfigProvider>
  )
}
