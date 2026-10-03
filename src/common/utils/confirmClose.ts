import { Modal } from 'antd'
import type { FormInstance } from 'antd'
import type { Translate } from '../context/language-context'

/**
 * Guards a modal's close action: if the form has unsaved edits, prompts the
 * user to confirm before discarding them; otherwise closes immediately.
 * Used by every create/edit modal's Cancel button and onCancel handler so
 * closing never silently throws work away.
 */
export function confirmDiscardChanges(form: FormInstance<any>, onDiscard: () => void, t: Translate = (text) => text) {
  if (!form.isFieldsTouched()) {
    onDiscard()
    return
  }

  Modal.confirm({
    title: t('Discard unsaved changes?'),
    content: t('You have unsaved changes that will be lost if you close this window.'),
    okText: t('Discard'),
    okButtonProps: { danger: true },
    cancelText: t('Keep Editing'),
    onOk: onDiscard,
  })
}
