import { Alert } from 'antd'

interface ErrorAlertProps {
  message: string
  onRetry?: () => void
}

export function ErrorAlert({ message, onRetry }: ErrorAlertProps) {
  return (
    <Alert
      type="error"
      showIcon
      message="發生錯誤"
      description={message}
      action={onRetry ? <a onClick={onRetry}>重試</a> : undefined}
    />
  )
}
