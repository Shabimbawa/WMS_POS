import { Layout, Button, Typography, Space, Flex, Switch } from 'antd'
import { LogoutOutlined, } from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useTheme } from '../../context/theme-context'
import { SunOutlined, MoonOutlined } from '@ant-design/icons'
import { useCurrentProfile } from '../../../pages/login/auth-useQuery'
import { logout } from '../../../queries/auth'
import { queryClient } from '../../../utils/query-client'
const { Header } = Layout
const { Text } = Typography

interface TopbarProps {
  onSignOut?: () => void
}

export function Topbar({ onSignOut }: TopbarProps) {
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

  return (
    <Header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        background: '#fff',
        borderBottom: '1px solid var(--border)',
        backgroundColor: 'var(--color-chrome)'
      }}
    >
      <Flex  gap='large'>

        {/* <img src={} alt="Maryville Logo" style={{ paddingLeft: 5, height: 40 }} /> */}

        <Flex vertical style={{ borderLeftWidth: 0.5, borderLeftStyle: 'solid', borderLeftColor: 'var(--text)', paddingLeft: 16 }}>
          <Typography style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.12em",
            textTransform: "uppercase", color: "var(--text)" }}>{profile?.roles === 'warehouse_admin' ? 'Warehouse Management System' : 'POS System'} </Typography>
          <Typography style={{ fontSize: 20, fontWeight: 600, color: 'white',   fontFamily: "Georgia, serif" }}>Wensor Trading IMS</Typography>
        </Flex>
      </Flex>
      

      <Space size="middle">
        <Flex vertical align="flex-end" style={{ lineHeight: 1.3 }}>
          <Text strong style={{ color: '#fff', fontSize: 13 }}>
            {email ?? ''}
          </Text>
          {profile?.roles && (
            <Text style={{ color: 'var(--text)', fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {profile.roles}
            </Text>
          )}
        </Flex>
        <Switch
              size='small'
              checked={mode === 'dark'}
              onChange={toggleTheme}
              checkedChildren={<MoonOutlined />}
              unCheckedChildren={<SunOutlined />}
        />
        <Button
          icon={<LogoutOutlined />}
          onClick={handleSignOut}
          type="text"
          danger
        >
          Sign Out
        </Button>
      </Space>
    </Header>
  )
}
