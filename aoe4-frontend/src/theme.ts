// AoE4 風格主題：深藍黑底、金色描邊、羊皮紙色文字。
// 同一組顏色也寫在 index.css 的 :root 與 dashboard/index.html，改色時三處一起改。
import { theme, type ThemeConfig } from 'antd'
import { registerTheme } from 'echarts'

export const AOE = {
  bg: '#0a0f15',
  panel: '#121a23',
  panel2: '#1a2430',
  line: '#2b3746',
  trim: '#5e4a2a',
  gold: '#d4aa5f',
  goldHi: '#f0d08a',
  goldLo: '#8a6a32',
  text: '#ece4d0',
  muted: '#98a3ae',
  me: '#4f9bf0',
  opp: '#e0533f',
  win: '#6cc36b',
  loss: '#e0533f',
  warn: '#e8923a',
} as const

export const FONT_UI = '"Noto Sans TC", "Microsoft JhengHei UI", "Microsoft JhengHei", "PingFang TC", system-ui, sans-serif'
export const FONT_DISPLAY = '"Cinzel", "Noto Serif TC", "Source Han Serif TC", "PMingLiU", serif'

export const antdTheme: ThemeConfig = {
  algorithm: theme.darkAlgorithm,
  token: {
    colorPrimary: AOE.gold,
    colorInfo: AOE.me,
    colorSuccess: AOE.win,
    colorError: AOE.loss,
    colorWarning: AOE.warn,
    colorLink: AOE.goldHi,
    colorBgBase: AOE.bg,
    colorBgLayout: AOE.bg,
    colorBgContainer: AOE.panel,
    colorBgElevated: AOE.panel2,
    colorBorder: AOE.line,
    colorBorderSecondary: '#222d3a',
    colorTextBase: AOE.text,
    colorTextSecondary: AOE.muted,
    borderRadius: 4,
    fontFamily: FONT_UI,
  },
  components: {
    Card: { headerBg: '#18222d', colorBorderSecondary: AOE.trim },
    Button: { primaryColor: '#1a1206', fontWeight: 600 },
    Tabs: { itemSelectedColor: AOE.goldHi, inkBarColor: AOE.gold, itemHoverColor: AOE.goldHi },
    Table: { headerBg: '#18212c', headerColor: AOE.gold, rowHoverBg: '#1c2733' },
    Layout: { headerBg: '#0d141c', bodyBg: AOE.bg, siderBg: '#0d141c' },
    Menu: { darkItemBg: '#0d141c', itemSelectedColor: AOE.goldHi },
  },
}

// echarts 主題：所有 <ReactECharts theme="aoe4"> 使用
registerTheme('aoe4', {
  backgroundColor: 'transparent',
  textStyle: { color: AOE.muted, fontFamily: FONT_UI },
  color: [AOE.gold, AOE.me, AOE.opp, AOE.win, '#b98ae0', '#e8923a', '#5fc8c0', '#c9a47e'],
  legend: { textStyle: { color: AOE.text }, pageTextStyle: { color: AOE.muted } },
  tooltip: {
    backgroundColor: 'rgba(14, 20, 28, 0.96)',
    borderColor: AOE.trim,
    textStyle: { color: AOE.text },
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#3a4656' } },
    axisTick: { lineStyle: { color: '#3a4656' } },
    axisLabel: { color: AOE.muted },
    splitLine: { lineStyle: { color: ['rgba(236, 228, 208, 0.07)'] } },
    nameTextStyle: { color: AOE.muted },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#3a4656' } },
    axisLabel: { color: AOE.muted },
    splitLine: { lineStyle: { color: ['rgba(236, 228, 208, 0.07)'] } },
    nameTextStyle: { color: AOE.muted },
  },
  timeAxis: {
    axisLine: { lineStyle: { color: '#3a4656' } },
    axisLabel: { color: AOE.muted },
    splitLine: { lineStyle: { color: ['rgba(236, 228, 208, 0.07)'] } },
  },
  visualMap: { textStyle: { color: AOE.muted } },
  dataZoom: { textStyle: { color: AOE.muted }, borderColor: AOE.line },
})
