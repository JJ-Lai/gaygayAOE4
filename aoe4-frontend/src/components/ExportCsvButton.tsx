import { Button } from 'antd'
import { DownloadOutlined } from '@ant-design/icons'

interface ExportCsvButtonProps {
  label?: string
  onExport: () => void
}

export function ExportCsvButton({ label = '匯出 CSV', onExport }: ExportCsvButtonProps) {
  return (
    <Button icon={<DownloadOutlined />} onClick={onExport}>
      {label}
    </Button>
  )
}
