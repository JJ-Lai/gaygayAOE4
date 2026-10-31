import { Alert, Button, Form, Input, InputNumber, Space, Typography, message } from 'antd'
import { useEffect, useState } from 'react'
import {
  clearSummaryApiKey,
  getErrorMessage,
  getSummaryApiKeyStatus,
  retryFailedSummaries,
  setSummaryApiKey,
  syncGameSummary,
} from '../api/client'
import type { SummaryApiKeyStatusView } from '../api/types'
import { extractSummaryApiKey } from '../utils/summaryApiKey'

type Props = {
  /** Prefill / default profile used when retrying summaries after save */
  defaultProfileId?: number
  /** When set, after save also re-fetch this single game */
  gameId?: number
  compact?: boolean
  onConfigured?: () => void
}

export function SummaryApiKeyForm({ defaultProfileId, gameId, compact = false, onConfigured }: Props) {
  const [status, setStatus] = useState<SummaryApiKeyStatusView | null>(null)
  const [saving, setSaving] = useState(false)
  const [form] = Form.useForm<{ apiKeyOrUrl: string; profileId?: number }>()

  const loadStatus = async () => {
    try {
      setStatus(await getSummaryApiKeyStatus())
    } catch (err) {
      message.error(getErrorMessage(err))
    }
  }

  useEffect(() => {
    void loadStatus()
  }, [])

  useEffect(() => {
    form.setFieldsValue({ profileId: defaultProfileId })
  }, [defaultProfileId, form])

  const onSave = async (values: { apiKeyOrUrl: string; profileId?: number }) => {
    const apiKey = extractSummaryApiKey(values.apiKeyOrUrl)
    if (!apiKey) {
      message.error('請貼上 Overlay URL（含 apiKey）或直接貼上 API Key')
      return
    }

    setSaving(true)
    try {
      await setSummaryApiKey(apiKey)
      const profileId = values.profileId ?? defaultProfileId

      if (gameId && profileId) {
        const single = await syncGameSummary(gameId, profileId)
        if (single.succeeded > 0) {
          message.success('API Key 已儲存，本場 Summary 同步成功')
        } else {
          message.warning('API Key 已儲存，但本場 Summary 仍無法取得（可能尚未產生或非你的對戰）')
        }
      } else if (profileId) {
        const result = await retryFailedSummaries(profileId, 20)
        message.success(
          `API Key 已儲存，已重試 Summary：成功 ${result.succeeded}／嘗試 ${result.attempted}`,
        )
      } else {
        message.success('Summary API Key 已儲存（僅本次伺服器執行期間有效）')
      }

      form.resetFields(['apiKeyOrUrl'])
      await loadStatus()
      onConfigured?.()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  const onClear = async () => {
    setSaving(true)
    try {
      await clearSummaryApiKey()
      message.success('已清除執行期間的 API Key')
      await loadStatus()
    } catch (err) {
      message.error(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {!compact && (
        <Typography.Paragraph type="secondary">
          到{' '}
          <a href="https://overlay.aoe4world.com/" target="_blank" rel="noreferrer">
            AoE4 World Overlay
          </a>{' '}
          登入後產生 Overlay URL，網址中會有 <Typography.Text code>apiKey=...</Typography.Text>。
          可直接貼上整段 URL，或只貼 Key。設定後即可抓取私人對戰的時間軸數據（資源、軍隊、建造事件）。
        </Typography.Paragraph>
      )}

      <Typography.Paragraph style={{ marginBottom: compact ? 8 : 16 }}>
        目前狀態：
        {status?.configured ? (
          <Typography.Text type="success">
            {' '}
            已設定（結尾 {status.maskedSuffix}）
            {status.runtimeOverride ? '，執行期間覆寫' : ''}
          </Typography.Text>
        ) : (
          <Typography.Text type="warning"> 未設定</Typography.Text>
        )}
      </Typography.Paragraph>

      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void onSave(values)}
        initialValues={{ profileId: defaultProfileId }}
      >
        <Form.Item
          name="apiKeyOrUrl"
          label={compact ? undefined : 'Overlay URL 或 API Key'}
          rules={[{ required: true, message: '請貼上 Overlay URL 或 API Key' }]}
        >
          <Input.Password
            placeholder="貼上含 apiKey 的 Overlay URL，或只貼 Key"
            autoComplete="off"
          />
        </Form.Item>

        {!compact && (
          <Form.Item
            name="profileId"
            label="儲存後重試此玩家的 Summary（選填）"
            tooltip="會重試先前 NOT_FOUND / 失敗的場次"
          >
            <InputNumber style={{ width: '100%' }} min={1} placeholder="例如 10861747" />
          </Form.Item>
        )}

        <Space wrap>
          <Button type="primary" htmlType="submit" loading={saving}>
            {gameId ? '儲存並抓取本場 Summary' : '儲存'}
          </Button>
          {status?.runtimeOverride && (
            <Button danger onClick={() => void onClear()} loading={saving}>
              清除
            </Button>
          )}
        </Space>
      </Form>

      {!compact && (
        <Alert
          style={{ marginTop: 16 }}
          type="info"
          showIcon
          message="安全提醒"
          description="Key 只存在伺服器記憶體，重啟後需重新輸入。請勿把含 apiKey 的 Overlay 連結貼到公開聊天或截圖。"
        />
      )}
    </div>
  )
}
