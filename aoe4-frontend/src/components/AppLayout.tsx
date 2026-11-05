import { Outlet, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Layout, Menu, Typography, Button, Space } from 'antd'
import {
  BarChartOutlined,
  HomeOutlined,
  LineChartOutlined,
  SettingOutlined,
  SwapOutlined,
  TableOutlined,
  TeamOutlined,
  EnvironmentOutlined,
  HistoryOutlined,
  QuestionCircleOutlined,
  ExperimentOutlined,
  DashboardOutlined,
  TrophyOutlined,
  ThunderboltOutlined,
  FireOutlined,
  FallOutlined,
} from '@ant-design/icons'
import { ProfileSearchBar } from './ProfileSearchBar'
import { FavoriteToggle } from './FavoritePlayers'
import { useAppStore } from '../store/useAppStore'

const { Header, Sider, Content } = Layout

// 被儀表板（dashboard/index.html 的「戰術模擬」分頁）用 iframe 嵌入時，不顯示這裡的頂部導覽列：
// 那些頁面需要後端 API，部署到 Cloudflare 的靜態網站上用不了。
const embedded = typeof window !== 'undefined' && window.self !== window.top

export function AppLayout({ showSidebar = false }: { showSidebar?: boolean }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { profileId } = useParams()
  const { player } = useAppStore()
  const numericProfileId = profileId ? Number(profileId) : null

  const base = profileId ? `/player/${profileId}` : ''
  const menuItems = profileId
    ? [
        { key: base, icon: <HomeOutlined />, label: '總覽' },
        { key: `${base}/resources`, icon: <LineChartOutlined />, label: '資源曲線' },
        { key: `${base}/matchups`, icon: <TeamOutlined />, label: 'Matchup' },
        { key: `${base}/military`, icon: <ThunderboltOutlined />, label: '軍事分差' },
        { key: `${base}/combat`, icon: <FireOutlined />, label: '戰鬥統計' },
        { key: `${base}/unit-losses`, icon: <FallOutlined />, label: '單位損失' },
        { key: `${base}/modes`, icon: <TrophyOutlined />, label: '模式分析' },
        { key: `${base}/maps`, icon: <EnvironmentOutlined />, label: '地圖分析' },
        { key: `${base}/patches`, icon: <HistoryOutlined />, label: '補丁分析' },
        { key: `${base}/games`, icon: <TableOutlined />, label: '對戰列表' },
        { key: `${base}/builds`, icon: <BarChartOutlined />, label: '建造偏好' },
      ]
    : []

  const selectedKey = location.pathname.replace(/\/games\/\d+.*/, `${base}/games`)

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!embedded && (
      <Header style={{ display: 'flex', alignItems: 'center', gap: 24, background: '#001529' }}>
        <Typography.Title
          level={4}
          style={{ color: '#fff', margin: 0, whiteSpace: 'nowrap', cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          AOE4 Analytics
        </Typography.Title>
        <div style={{ flex: 1, maxWidth: 480 }}>
          <ProfileSearchBar compact />
        </div>
        <Space>
          {numericProfileId && (
            <FavoriteToggle profileId={numericProfileId} playerName={player?.name} />
          )}
          <Button type="text" style={{ color: '#fff' }} icon={<DashboardOutlined />} onClick={() => navigate('/ops')}>
            同步
          </Button>
          <Button type="text" style={{ color: '#fff' }} icon={<SwapOutlined />} onClick={() => navigate('/compare')}>
            比較
          </Button>
          <Button type="text" style={{ color: '#fff' }} icon={<ExperimentOutlined />} onClick={() => navigate('/simulate')}>
            戰術模擬
          </Button>
          <Button type="text" style={{ color: '#fff' }} icon={<QuestionCircleOutlined />} onClick={() => navigate('/help')}>
            說明
          </Button>
          <Button type="text" style={{ color: '#fff' }} icon={<SettingOutlined />} onClick={() => navigate('/settings')}>
            設定
          </Button>
        </Space>
      </Header>
      )}
      <Layout>
        {showSidebar && profileId && (
          <Sider width={200} theme="light" breakpoint="lg" collapsedWidth={0}>
            <Menu
              mode="inline"
              selectedKeys={[selectedKey]}
              items={menuItems}
              onClick={({ key }) => navigate(key)}
              style={{ height: '100%' }}
            />
          </Sider>
        )}
        <Content style={{ padding: embedded ? 16 : 24, background: '#f5f5f5' }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
