import { Card, Col, DatePicker, InputNumber, Row, Select } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useEffect } from 'react'
import { getMetaFilters } from '../api/client'
import { useAppStore } from '../store/useAppStore'

const { RangePicker } = DatePicker

export function FilterPanel() {
  const { meta, filters, setMeta, setFilters } = useAppStore()

  useEffect(() => {
    if (!meta) {
      void getMetaFilters().then(setMeta).catch(() => undefined)
    }
  }, [meta, setMeta])

  const civOptions = meta?.civilizations.map((c) => ({ label: c.displayName, value: c.code })) ?? []
  const leaderboardOptions = meta?.leaderboards.map((l) => ({ label: l.displayName, value: l.code })) ?? []
  const patchOptions = meta?.patches.map((p) => ({ label: p.displayName, value: Number(p.code) })) ?? []

  const onDateChange = (dates: [Dayjs | null, Dayjs | null] | null) => {
    setFilters({
      dateFrom: dates?.[0]?.toISOString(),
      dateTo: dates?.[1]?.toISOString(),
    })
  }

  return (
    <Card size="small" title="篩選條件">
      <Row gutter={[12, 12]}>
        <Col xs={24} sm={12} md={6}>
          <Select
            allowClear
            placeholder="文明"
            style={{ width: '100%' }}
            options={civOptions}
            value={filters.civ}
            onChange={(civ) => setFilters({ civ })}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Select
            allowClear
            placeholder="對手文明"
            style={{ width: '100%' }}
            options={civOptions}
            value={filters.opponentCiv}
            onChange={(opponentCiv) => setFilters({ opponentCiv })}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Select
            allowClear
            placeholder="模式"
            style={{ width: '100%' }}
            options={leaderboardOptions}
            value={filters.leaderboard}
            onChange={(leaderboard) => setFilters({ leaderboard })}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Select
            allowClear
            placeholder="補丁"
            style={{ width: '100%' }}
            options={patchOptions}
            value={filters.patch}
            onChange={(patch) => setFilters({ patch })}
          />
        </Col>
        <Col xs={12} sm={6} md={3}>
          <InputNumber
            placeholder="Rating 下限"
            style={{ width: '100%' }}
            min={0}
            max={3000}
            value={filters.ratingMin}
            onChange={(ratingMin) => setFilters({ ratingMin: ratingMin ?? undefined })}
          />
        </Col>
        <Col xs={12} sm={6} md={3}>
          <InputNumber
            placeholder="Rating 上限"
            style={{ width: '100%' }}
            min={0}
            max={3000}
            value={filters.ratingMax}
            onChange={(ratingMax) => setFilters({ ratingMax: ratingMax ?? undefined })}
          />
        </Col>
        <Col xs={24} md={12}>
          <RangePicker
            style={{ width: '100%' }}
            onChange={onDateChange}
            defaultValue={
              filters.dateFrom && filters.dateTo
                ? [dayjs(filters.dateFrom as string), dayjs(filters.dateTo as string)]
                : undefined
            }
          />
        </Col>
      </Row>
    </Card>
  )
}
