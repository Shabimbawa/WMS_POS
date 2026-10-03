import { notification } from 'antd'
import { useLanguage } from '../../context/language-context'

export function ErrorNotificationPopup() {
  const { t } = useLanguage()
  const [api, contextHolder] = notification.useNotification()

  const showError = (error: any, title = 'Something went wrong') => {
    api.error({
      message: t(title),
      description: t(error?.message || 'An unexpected error occurred.'),
      placement: 'bottomRight',
      duration: 5,
    })
  }

  return { showError, contextHolder }
}
