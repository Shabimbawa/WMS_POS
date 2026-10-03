import { Popover, Typography } from 'antd'
import type { MouseEvent, ReactNode } from 'react'
import { useLanguage } from '../../context/language-context'

interface OverflowListProps<T> {
  items: T[]
  getKey: (item: T) => string
  renderItem: (item: T) => ReactNode
  /** How many items show before the rest fold into "+N more". */
  max?: number
  /** Heading of the popover that lists every item. */
  title?: ReactNode
  /** `vertical` stacks one item per line; `inline` wraps them, e.g. tags. */
  layout?: 'vertical' | 'inline'
}

const layoutStyle = (layout: 'vertical' | 'inline') =>
  layout === 'inline'
    ? { display: 'flex', flexWrap: 'wrap' as const, gap: 4, alignItems: 'center' }
    : { display: 'flex', flexDirection: 'column' as const, gap: 2 }

/**
 * Shows the first `max` items and folds the rest behind a "+N more" link
 * that opens the full list in a scrollable popover, so a row or card with
 * fifty products stays the same height as one with three.
 */
export function OverflowList<T>({
  items,
  getKey,
  renderItem,
  max = 3,
  title,
  layout = 'vertical',
}: OverflowListProps<T>) {
  const { t } = useLanguage()
  // Folding away a single item saves nothing; show it instead.
  const visible = items.length <= max + 1 ? items : items.slice(0, max)
  const hidden = items.length - visible.length

  const all = (
    <div
      style={{
        ...layoutStyle(layout),
        maxHeight: 360,
        width: layout === 'inline' ? 320 : 300,
        overflowY: 'auto',
        paddingRight: 4,
      }}
    >
      {items.map((item) => (
        <div key={getKey(item)}>{renderItem(item)}</div>
      ))}
    </div>
  )

  return (
    <div style={layoutStyle(layout)}>
      {visible.map((item) => (
        <div key={getKey(item)}>{renderItem(item)}</div>
      ))}
      {hidden > 0 && (
        // Clicks inside the popover bubble through React's tree, so stop them
        // here or a clickable parent (a summary card) opens as well.
        <span onClick={(e: MouseEvent) => e.stopPropagation()}>
          <Popover
            trigger="click"
            placement="bottomLeft"
            title={title}
            content={all}
          >
            <Typography.Link style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
              +{hidden} {t('more')}
            </Typography.Link>
          </Popover>
        </span>
      )}
    </div>
  )
}

/** A label on the left and a number on the right, for "product · sacks" lists. */
export function LabelValue({
  label,
  value,
}: {
  label: ReactNode
  value: ReactNode
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span>{label}</span>
      <span style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}
