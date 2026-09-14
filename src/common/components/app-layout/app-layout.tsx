import { useEffect, useState } from 'react'
import { Flex, Layout, Spin } from 'antd'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Sidebar } from '../sidebar/sidebar'
import { Topbar } from '../topbar/topbar'
import { supabase } from '../../../utils/supabase-client'
import { useCurrentProfile } from '../../../pages/login/auth-useQuery'
import { getLandingPath, rolesForPath } from '../sidebar/nav-items'

const { Header, Sider, Content } = Layout


function useRequireAuth() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let isMounted = true

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!isMounted) return
      setChecking(false)
      if (!session) navigate('/', { replace: true })
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      // No cache clear here either — see topbar.tsx and utils/query-client.ts.
      // Clearing while this layout's pages are mounted is exactly what left the
      // next session staring at an empty page.
      if (!session) navigate('/', { replace: true })
    })

    return () => {
      isMounted = false
      subscription.subscription.unsubscribe()
    }
  }, [navigate])

  return checking
}

/**
 * Redirects a signed-in user off any route their role doesn't own, so role
 * enforcement isn't just a hidden sidebar link — the page never mounts and its
 * queries never fire. Unknown paths are denied too, so a route added to the
 * router but never registered in NAV_ITEMS fails closed.
 *
 * This is UX and defense-in-depth, not access control: the role comes from a
 * row the browser fetched. Supabase RLS remains the real boundary.
 */
function useRequireRole() {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: profile, isLoading, isError } = useCurrentProfile()

  // A failed profile lookup deliberately doesn't redirect — bouncing on an
  // error risks a loop, and RLS still governs what the page can read.
  const allowed = profile ? (rolesForPath(location.pathname)?.includes(profile.roles) ?? false) : true

  useEffect(() => {
    if (!profile || allowed) return
    navigate(getLandingPath(profile.roles), { replace: true })
  }, [profile, allowed, navigate])

  return { checkingRole: isLoading && !isError, allowed }
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const checkingAuth = useRequireAuth()
  const { checkingRole, allowed } = useRequireRole()


  // `!allowed` holds the spinner while the redirect effect runs, so the page
  // being redirected away from never renders a frame.
  if (checkingAuth || checkingRole || !allowed) {
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

        
        <Content
          style={{
            overflow: 'auto',
            padding:  24,
        
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}