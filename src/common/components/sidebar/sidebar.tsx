import { Menu } from 'antd'
import { useLocation, useNavigate } from 'react-router-dom'
import type { ItemType } from 'antd/es/menu/interface'
import { useCurrentProfile } from '../../../pages/login/auth-useQuery'
import { NAV_ITEMS, navItemForPath } from './nav-items'
import { useLanguage } from '../../context/language-context'

type SidebarProps = {
  collapsed: boolean
}

export function Sidebar({ collapsed }: SidebarProps) {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const { data: profile } = useCurrentProfile()

  const items: ItemType[] = []
  if (profile) {
    let currentGroup: string | undefined
    let children: ItemType[] = []

    const flush = () => {
      if (!children.length) return
      if (currentGroup) {
        items.push({ type: 'group', label: t(currentGroup), children })
      } else {
        items.push(...children)
      }
      children = []
    }

    for (const item of NAV_ITEMS.filter((i) => i.roles.includes(profile.roles))) {
      if (item.group !== currentGroup) {
        flush()
        currentGroup = item.group
      }
      children.push({
        key: item.key,
        icon: item.icon,
        // Keep the label mounted when collapsed so Ant Design can expose it in
        // the item tooltip. CSS handles the compact rail presentation.
        label: t(item.label),
        onClick: () => navigate(item.path),
      })
    }
    flush()
  }

  // Derived from the URL rather than left to antd's internal state, so the
  // entry stays highlighted when navigation comes from somewhere other than a
  // menu click — the post-login landing redirect, a deep link, a browser back.
  const selectedKey = navItemForPath(location.pathname)?.key

  return (
    <Menu
      className="app-sidebar"
      mode="inline"
      inlineCollapsed={collapsed}
      selectedKeys={selectedKey ? [selectedKey] : []}
      items={items}
    />
  )
}
