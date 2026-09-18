import { useEffect, useState } from 'react'
import { Flex, Layout, Spin } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from '../sidebar/sidebar'
import { Topbar } from '../topbar/topbar'
import { useCurrentProfile } from '../../../pages/login/auth-useQuery'
import { getLandingPath, rolesForPath } from '../sidebar/nav-items'

const { Header, Sider, Content } = Layout

/**
 * The API session is authoritative. A missing/expired session redirects to the
 * login page; an authenticated user on a route outside their role is sent to
 * their first allowed page.
 */
function useRequireAccess() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: profile, isLoading, isError } = useCurrentProfile()
  const allowed = profile
    ? (rolesForPath(location.pathname)?.includes(profile.roles) ?? false)
    : false

  useEffect(() => {
    if (isError) {
      navigate('/', { replace: true })
      return
    }
    if (!profile || allowed) return
    navigate(getLandingPath(profile.roles), { replace: true })
  }, [profile, allowed, isError, navigate])

  return { checking: isLoading, allowed }
}
export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const { checking, allowed } = useRequireAccess()

  if (checking || !allowed) {
    return (
      <Flex justify="center" align="center" style={{ height: '100vh' }}>
        <Spin size="large" />
      </Flex>
    )
  }

  return (
    <Layout style={{ height: '100vh' }}>
      <Header style={{ padding: 0, backgroundColor: 'var(--color-chrome)' }}>
        <Topbar />
      </Header>
      <Layout style={{ flex: 1 }}>
        <Sider
          collapsible
          collapsed={collapsed}
          onCollapse={setCollapsed}
          style={{ background: '#fff' }}
        >
          <Sidebar collapsed={collapsed} />
        </Sider>
        <Content style={{ overflow: 'auto', padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
