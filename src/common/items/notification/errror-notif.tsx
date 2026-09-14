import { notification } from 'antd'

export function ErrorNotificationPopup() {
  const [api, contextHolder] = notification.useNotification()

  const showError = (error: any, title = 'Something went wrong') => {
    api.error({
      message: title,
      description: error?.message || 'An unexpected error occurred.',
      placement: 'bottomRight',
      duration: 5,
    })
  }

  return { showError, contextHolder }
}