import { useEffect, useState } from 'react'

export function useGitBranch(projectPath: string): string | null {
  const [branch, setBranch] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    const refresh = () =>
      void window.api.invoke('git:info', projectPath).then((info) => {
        if (alive) setBranch(info.branch)
      })
    refresh()
    const off = window.api.on('git:changed', (changed) => {
      if (changed === projectPath) refresh()
    })
    return () => {
      alive = false
      off()
    }
  }, [projectPath])
  return branch
}
