import { fileIcon } from './fileIcon'

/** Small VS Code-like icon: shape by kind, color by file type. */
export function FileIcon({ name, isDir = false, open = false }: { name: string; isDir?: boolean; open?: boolean }) {
  const { kind, color } = fileIcon(name, isDir, open)
  const common = { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', className: 'shrink-0', 'aria-hidden': true } as const
  if (kind === 'folder' || kind === 'folder-open') {
    return (
      <svg {...common}>
        <path
          d={
            kind === 'folder'
              ? 'M1.5 4.3c0-.6.5-1 1-1h3.3l1.4 1.6h6.3c.6 0 1 .5 1 1v6.1c0 .6-.4 1-1 1h-11c-.5 0-1-.4-1-1V4.3Z'
              : 'M1.5 4.3c0-.6.5-1 1-1h3.3l1.4 1.6h6.3c.6 0 1 .5 1 1v1H4.6L2 12.9c-.3 0-.5-.4-.5-.9V4.3Zm1.7 8.7 2.4-5.2h9.9l-2.4 5.2H3.2Z'
          }
          fill={color}
          fillOpacity="0.85"
        />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M4 1.9h4.8L12 5.1v9H4z" fill={color} fillOpacity="0.16" stroke={color} strokeWidth="1.1" strokeLinejoin="round" />
      {kind === 'code' && <path d="M6.6 8.6 5.4 9.9l1.2 1.3M9.4 8.6l1.2 1.3-1.2 1.3" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />}
      {kind === 'config' && <circle cx="8" cy="10.1" r="1.7" stroke={color} strokeWidth="1.1" />}
      {kind === 'doc' && <path d="M5.9 8.7h4.2M5.9 10.9h3" stroke={color} strokeWidth="1.1" strokeLinecap="round" />}
      {kind === 'image' && <path d="M4.6 12.6 6.9 10l1.5 1.5 1.2-1.2 1.9 2.3" stroke={color} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}
