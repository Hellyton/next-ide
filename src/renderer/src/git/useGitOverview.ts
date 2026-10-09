import { useCallback, useEffect, useState } from 'react'
import type { GitOverview } from '@shared/git'

const EMPTY: GitOverview = { branch: null, upstream: null, ahead: 0, behind: 0, changes: [] }

/** Branch, ahead/behind and changed files of a project, kept fresh by the file watcher. */
export function useGitOverview(projectPath: string): { overview: GitOverview; refresh(): void } {
  const [overview, setOverview] = useState<GitOverview>(EMPTY)
  const [version, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  useEffect(() => {
    let alive = true
    window.api
      .invoke('git:overview', projectPath)
      .then((next) => {
        if (alive) setOverview(next)
      })
      .catch((err) => console.error('[next-ide] git overview failed', err))
    return () => {
      alive = false
    }
  }, [projectPath, version])
  useEffect(
    () =>
      window.api.on('git:changed', (changed) => {
        if (changed === projectPath) refresh()
      }),
    [projectPath, refresh],
  )
  return { overview, refresh }
}
