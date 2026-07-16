import { Empty } from 'antd'

interface EmptyStateProps {
  description?: string
}

export function EmptyState({ description = '尚無資料' }: EmptyStateProps) {
  return <Empty description={description} />
}
