import { Card, Col, Row } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { SummaryApiKeyForm } from '../components/SummaryApiKeyForm'

export function SettingsPage() {
  const [searchParams] = useSearchParams()
  const profileFromQuery = searchParams.get('profileId')
  const defaultProfileId = profileFromQuery ? Number(profileFromQuery) : undefined

  return (
    <Row justify="center">
      <Col xs={24} md={16} lg={12}>
        <Card title="私人對戰 Summary API Key">
          <SummaryApiKeyForm
            defaultProfileId={Number.isFinite(defaultProfileId) ? defaultProfileId : undefined}
          />
        </Card>
      </Col>
    </Row>
  )
}
