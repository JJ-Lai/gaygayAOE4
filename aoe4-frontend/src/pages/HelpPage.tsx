import { Card, Col, Row, Typography } from 'antd'
import { Link } from 'react-router-dom'

const { Title, Paragraph, Text } = Typography

export function HelpPage() {
  return (
    <Row justify="center">
      <Col xs={24} lg={18}>
        <Card>
          <Title level={3}>使用說明</Title>

          <Title level={4}>如何找到 Profile ID</Title>
          <Paragraph>
            在{' '}
            <a href="https://aoe4world.com" target="_blank" rel="noreferrer">
              AoE4 World
            </a>{' '}
            開啟玩家頁面，網址中的數字即為 Profile ID：
          </Paragraph>
          <Paragraph>
            <Text code>https://aoe4world.com/players/10861747</Text>
            <br />
            其中 <Text strong>10861747</Text> 就是 Profile ID。
          </Paragraph>

          <Title level={4}>私人對戰 Summary（API Key）</Title>
          <Paragraph>
            若資源曲線／單場時間軸沒有資料，通常是對戰紀錄設為私人。請：
          </Paragraph>
          <Paragraph>
            <ol>
              <li>
                開啟{' '}
                <a href="https://overlay.aoe4world.com/" target="_blank" rel="noreferrer">
                  AoE4 World Overlay
                </a>{' '}
                並登入
              </li>
              <li>
                產生 Overlay URL，確認網址含 <Text code>apiKey=...</Text>
              </li>
              <li>
                到 <Link to="/settings">設定</Link> 貼上整段 URL（或只貼 Key），並填入自己的 Profile ID
              </li>
              <li>儲存後系統會重試先前失敗／找不到的 Summary；也可在單場詳情頁直接輸入並抓取本場</li>
            </ol>
          </Paragraph>
          <Paragraph type="secondary">
            請勿分享含 apiKey 的連結。Key 僅存於伺服器記憶體，重啟後需重新輸入。
          </Paragraph>

          <Title level={4}>搜尋與同步</Title>
          <Paragraph>
            首頁或頂部搜尋列可輸入 Profile ID 或玩家名稱。首次查詢會自動同步對戰清單。
          </Paragraph>

          <Title level={4}>篩選與分享</Title>
          <Paragraph>
            玩家儀表板支援文明、模式、補丁、Rating 區間與日期篩選。條件會同步至網址，可直接複製連結分享，例如{' '}
            <Text code>/player/10861747/matchups?civ=english&ratingMin=1000</Text>。
          </Paragraph>

          <Title level={4}>分析頁面</Title>
          <Paragraph>
            <ul>
              <li><strong>總覽</strong>：勝率、最常用文明、近期勝負</li>
              <li><strong>資源曲線</strong>：需有 Summary 的對戰（公開或私人）</li>
              <li><strong>Matchup</strong>：文明對戰矩陣與軍事分差</li>
              <li><strong>模式分析</strong>：rm_1v1、qm_2v2 等各 leaderboard 勝率</li>
              <li><strong>軍事分差</strong>：選擇文明後，對各對手文明的平均軍事分差</li>
              <li><strong>地圖分析 / 補丁分析</strong>：各維度勝率統計</li>
              <li><strong>建造偏好</strong>：開局建造統計（需 Summary）</li>
            </ul>
          </Paragraph>

          <Title level={4}>比較與匯出</Title>
          <Paragraph>
            使用頂部「比較」可並排兩位玩家總覽。Matchup、地圖、補丁、戰鬥統計、單位損失頁面支援 CSV / JSON 匯出。
          </Paragraph>

          <Title level={4}>我的最愛</Title>
          <Paragraph>
            在玩家頁面點擊星號可將玩家加入最愛，首頁會顯示快速入口（儲存於瀏覽器 localStorage）。
          </Paragraph>
        </Card>
      </Col>
    </Row>
  )
}
