import { Button, Popconfirm, type ButtonProps } from 'antd'
import { Trash2 } from 'lucide-react'
import type { ReactNode } from 'react'

interface ConfirmDeleteButtonProps {
  onConfirm: () => void
  title?: ReactNode
  description?: ReactNode
  okText?: string
  cancelText?: string
  loading?: boolean
  disabled?: boolean
  size?: ButtonProps['size']
  /** Set to render a plain text/icon-only trigger instead of the default danger button. */
  children?: ReactNode
}

/**
 * Shared delete-confirmation control. Wraps antd's Popconfirm around a danger
 * Button so every "delete this row" action across the app looks and behaves
 * the same way.
 */
export function ConfirmDeleteButton({
  onConfirm,
  title = 'Delete this record?',
  description = 'This action cannot be undone.',
  okText = 'Delete',
  cancelText = 'Cancel',
  loading = false,
  disabled = false,
  size = 'small',
  children,
}: ConfirmDeleteButtonProps) {
  return (
    <Popconfirm
      title={title}
      description={description}
      okText={okText}
      cancelText={cancelText}
      okButtonProps={{ danger: true }}
      onConfirm={onConfirm}
      disabled={disabled}
    >
      <Button size={size} danger loading={loading} disabled={disabled} icon={children ? undefined : <Trash2 size={14} />}>
        {children ?? 'Delete'}
      </Button>
    </Popconfirm>
  )
}

interface ConfirmActionButtonProps {
  onConfirm: () => void
  title: ReactNode
  description?: ReactNode
  okText?: string
  cancelText?: string
  loading?: boolean
  disabled?: boolean
  size?: ButtonProps['size']
  /** Renders the trigger and the popconfirm's OK button in antd's danger styling. */
  danger?: boolean
  icon?: ReactNode
  children: ReactNode
}

/**
 * Shared confirm-before-acting control for non-delete actions (approve,
 * reject, etc.) that still warrant a "are you sure?" step. Pairs with
 * ConfirmDeleteButton so every confirm-gated action in the app looks and
 * behaves the same way.
 */
export function ConfirmActionButton({
  onConfirm,
  title,
  description,
  okText = 'Confirm',
  cancelText = 'Cancel',
  loading = false,
  disabled = false,
  size = 'small',
  danger = false,
  icon,
  children,
}: ConfirmActionButtonProps) {
  return (
    <Popconfirm
      title={title}
      description={description}
      okText={okText}
      cancelText={cancelText}
      okButtonProps={{ danger }}
      onConfirm={onConfirm}
      disabled={disabled}
    >
      <Button size={size} danger={danger} loading={loading} disabled={disabled} icon={icon}>
        {children}
      </Button>
    </Popconfirm>
  )
}
