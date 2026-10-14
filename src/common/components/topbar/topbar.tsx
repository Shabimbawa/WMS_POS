import { Layout, Button, Typography, Space, Flex, Switch, Tooltip } from 'antd'
import { LogoutOutlined, SunOutlined, MoonOutlined } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../context/theme-context'
import { useCurrentProfile } from '../../../pages/login/auth-useQuery'
import { logout } from '../../../queries/auth'
import { queryClient } from '../../../utils/query-client'
import { LanguageToggle, useLanguage } from '../../context/language-context'
const { Header } = Layout
const { Text } = Typography

interface TopbarProps {
  onSignOut?: () => void
}

export function Topbar({ onSignOut }: TopbarProps) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { mode, toggleTheme } = useTheme()
  const { data: profile, email } = useCurrentProfile()
  const handleSignOut = async () => {
    try {
      await logout()
    } finally {
      queryClient.clear()
      onSignOut?.()
      navigate('/', { replace: true })
    }
  }

  const productName = profile?.roles === 'warehouse_admin'
    ? 'Inventory Management'
    : 'Point of Sale'

  return (
    <Header className="app-topbar">
      <Flex align="center" className="topbar-brand">
        <div className="topbar-brand-mark" aria-hidden="true">WT</div>
        <div className="topbar-brand-copy">
          <Text className="topbar-company">Wensor Trading</Text>
          <Text className="topbar-product">{t(productName)}</Text>
        </div>
      </Flex>

      <Space size={12} className="topbar-actions">
        <div className="topbar-account">
          <Text className="topbar-email">{email ?? ''}</Text>
          {profile?.roles && <Text className="topbar-role">{t(profile.roles)}</Text>}
        </div>
        <div className="topbar-divider" />
        <LanguageToggle compact />
        <Tooltip title={t(mode === 'dark' ? 'Use light theme' : 'Use dark theme')}>
          <Switch
            size="small"
            checked={mode === 'dark'}
            onChange={toggleTheme}
            checkedChildren={<MoonOutlined />}
            unCheckedChildren={<SunOutlined />}
            aria-label={t('Toggle color theme')}
          />
        </Tooltip>
        <Button className="topbar-signout" icon={<LogoutOutlined />} onClick={handleSignOut} type="text">
          {t('Sign Out')}
        </Button>
      </Space>
    </Header>
  )
}
