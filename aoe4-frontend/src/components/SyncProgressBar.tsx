import { Progress, Space, Typography } from 'antd'
import type { PlayerSyncStatusView } from '../api/types'

interface SyncProgressBarProps {
  status: PlayerSyncStatusView
}

export function SyncProgressBar({ status }: SyncProgressBarProps) {
  const total = status.totalGames || 1
  const synced = status.summariesSynced + status.summariesFailed
  const percent = Math.min(100, Math.round((synced / total) * 100))

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Typography.Text>同步對戰清單與 Summary 中…</Typography.Text>
      <Progress percent={percent} status="active" />
      <Typography.Text type="secondary">
        對戰 {status.totalGames} 場 · Summary 完成 {status.summariesSynced} · 待處理 {status.summariesPending}
      </Typography.Text>
    </Space>
  )
}
