import { Menu, type MenuItemConstructorOptions } from 'electron'
import { BLUR_STEPS, TRANSPARENCY_STEPS } from '@shared/models'

export function installMenu(opts: {
  notifications: boolean
  onToggleNotifications(enabled: boolean): void
  transparency: number
  onTransparency(percent: number): void
  blur: number
  onBlur(percent: number): void
}): void {
  const template: MenuItemConstructorOptions[] = [
    { role: 'appMenu' },
    { role: 'editMenu' },
    {
      label: 'Exibir',
      submenu: [
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Janela',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        {
          label: 'Notificações dos agentes',
          type: 'checkbox',
          checked: opts.notifications,
          click: (item) => opts.onToggleNotifications(item.checked),
        },
        {
          label: 'Transparência',
          submenu: TRANSPARENCY_STEPS.map((percent) => ({
            label: percent === 0 ? 'Nenhuma' : `${percent}%`,
            type: 'radio' as const,
            checked: percent === opts.transparency,
            click: () => opts.onTransparency(percent),
          })),
        },
        {
          label: 'Desfoque do fundo',
          submenu: BLUR_STEPS.map((percent) => ({
            label: percent === 0 ? 'Nenhum' : `${percent}%`,
            type: 'radio' as const,
            checked: percent === opts.blur,
            click: () => opts.onBlur(percent),
          })),
        },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}
