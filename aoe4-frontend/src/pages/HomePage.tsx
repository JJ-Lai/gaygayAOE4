import { Card, Col, Row, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { ProfileSearchBar } from '../components/ProfileSearchBar'
import { FavoriteList } from '../components/FavoritePlayers'

export function HomePage() {
  return (
    <Row justify="center" style={{ marginTop: 48 }}>
      <Col xs={24} md={16} lg={12}>
        <Card>
          <Typography.Title level={3}>世紀帝國 IV 對戰分析</Typography.Title>
          <Typography.Paragraph type="secondary">
            輸入 AoE4 World 的 Profile ID 或玩家名稱開始分析。開發期預設範例：10861747。
            要看私人對戰的資源／軍隊時間軸，請到頂部「設定」貼上 Overlay URL 中的{' '}
            <Typography.Text code>apiKey</Typography.Text>（也可直接貼整段 Overlay 連結）。
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            如何找到 Profile ID？開啟{' '}
            <a href="https://aoe4world.com/players/10861747" target="_blank" rel="noreferrer">
              AoE4 World 玩家頁面
            </a>
            ，網址中的數字即為 ID，例如 <Typography.Text code>10861747</Typography.Text>。
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary">
            不確定 Profile ID？請查看 <Link to="/help">使用說明</Link>。
            要用官方單位與採集參數試算升代、軍隊時機或村民配置，請開 <Link to="/simulate">戰術模擬</Link>。
          </Typography.Paragraph>
          <ProfileSearchBar />
          <div style={{ marginTop: 16 }}>
            <FavoriteList />
          </div>
        </Card>
      </Col>
    </Row>
  )
}
