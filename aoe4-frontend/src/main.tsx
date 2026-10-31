import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConfigProvider } from 'antd'
import zhTW from 'antd/locale/zh_TW'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider locale={zhTW}>
      <App />
    </ConfigProvider>
  </StrictMode>,
)
