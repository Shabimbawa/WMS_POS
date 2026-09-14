import { ConfigProvider, Menu } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ItemType } from 'antd/es/menu/interface'
import { useCurrentProfile } from '../../../pages/login/auth-useQuery'
import { NAV_ITEMS, navItemForPath } from './nav-items'

type SidebarProps = {
  collapsed: boolean
}

export function Sidebar({ collapsed }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { data: profile } = useCurrentProfile()

  const items: ItemType[] = profile
    ? NAV_ITEMS.filter((item) => item.roles.includes(profile.roles)).map((item) => ({
        key: item.key,
        icon: item.icon,
        label: collapsed ? null : item.label,
        onClick: () => navigate(item.path),
      }))
    : []

  // Derived from the URL rather than left to antd's internal state, so the
  // entry stays highlighted when navigation comes from somewhere other than a
  // menu click — the post-login landing redirect, a deep link, a browser back.
  const selectedKey = navItemForPath(location.pathname)?.key

  return (
    <ConfigProvider
      theme={{
        components: {
          Menu: {
            itemHoverBg: 'var(--color-chrome-accent)',
            itemHoverColor: '#fff',
            itemSelectedBg: 'var(--color-chrome-accent)',
            itemSelectedColor: '#fff',
          },
        },
      }}
    >
      <Menu
        mode="inline"
        inlineCollapsed={collapsed}
        style={{
          height: '100%',
          borderRight: 0,
          boxShadow: '2px 0 8px rgba(0, 0, 0, 0.12)',
        }}
        selectedKeys={selectedKey ? [selectedKey] : []}
        items={items}
      />
    </ConfigProvider>
  )
}