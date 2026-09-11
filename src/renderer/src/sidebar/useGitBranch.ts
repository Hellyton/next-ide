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
    window.addEventListener('focus', refresh)
    return () => {
      alive = false
      window.removeEventListener('focus', refresh)
    }
  }, [projectPath])
  return branch
}
