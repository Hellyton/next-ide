import { toggleSidebar } from './toggleSidebar'

/** Sits right of the macOS traffic lights, in both states, so it never moves under the cursor. */
export function SidebarToggle({ collapsed }: { collapsed: boolean }) {
  const label = collapsed ? 'Mostrar barra lateral (⌘B)' : 'Ocultar barra lateral (⌘B)'
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      data-testid="sidebar-toggle"
      onClick={toggleSidebar}
      className="fixed top-[7px] left-[78px] z-50 flex h-[22px] w-[26px] items-center justify-center rounded text-neutral-500 [-webkit-app-region:no-drag] hover:bg-neutral-800 hover:text-neutral-200 focus-visible:ring-1 focus-visible:ring-neutral-600 focus-visible:outline-none"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
        <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" />
        <line x1="6" y1="3" x2="6" y2="13" />
        {!collapsed && <rect x="2.4" y="3.4" width="3" height="9.2" rx="0.8" fill="currentColor" stroke="none" opacity="0.45" />}
      </svg>
    </button>
  )
}
