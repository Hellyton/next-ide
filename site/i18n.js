// Language switch for the next-ide site. The HTML is written in Portuguese (the default);
// English comes from the table below. The Portuguese strings are read back from the page
// itself, so they are never duplicated here. The choice is remembered in localStorage.
;(() => {
  const KEY = 'next-ide-lang'

  const EN = {
    skip: 'Skip to content',
    nav: 'Primary',
    'nav.tour': 'Tour',
    'nav.how': 'How it works',
    'nav.faq': 'FAQ',
    'nav.download': 'Download',
    lang: 'Language',
    'hero.kicker': 'Open source · macOS',
    'hero.title': 'Every Claude Code session. <span class="landmark">One window.</span>',
    'hero.lede': 'A native macOS IDE that runs your own <code>claude</code> across all your projects, side by side. Chat, split panes, terminal, files and Git, without a wall of terminal tabs.',
    'hero.download': 'Download for macOS',
    'hero.star': 'Star on GitHub',
    'hero.meta': 'Free · MIT · Apple Silicon &amp; Intel · macOS 13+ · signed and notarized',
    'alt.hero': 'next-ide with two Claude Code sessions side by side: one adding discount codes with an inline diff, the other explaining a slow checkout query.',
    'tour.title': 'A desk for every project.',
    'tour.s0.h': 'Sessions side by side',
    'tour.s0.p': 'Every project lives in the sidebar, grouped into workspaces. Open as many Claude sessions as you want and split them on screen with <kbd>⌘\\</kbd>. You see at a glance which one is working, waiting or done.',
    'tour.s1.h': 'Permissions in the chat',
    'tour.s1.p': 'Claude asks before it runs something risky, right where you are reading. Allow once, always for this project, or deny. Manual, accept-edits, plan and auto modes are one <kbd>⇧Tab</kbd> away.',
    'tour.s2.h': 'Every slash command',
    'tour.s2.p': '<code>/resume</code>, <code>/rewind</code>, <code>/context</code>, <code>/model</code>, <code>/mcp</code> and the rest of the CLI, plus <code>@</code> mentions for files and subagents, image paste and background tasks.',
    'tour.s3.h': 'Files and a real terminal',
    'tour.s3.p': 'A file tree, a fast highlighted viewer and editor, <kbd>⌘P</kbd> quick open, and a zsh terminal in any pane. The layout comes back the next time you open the app.',
    'tour.s4.h': 'Commit without leaving',
    'tour.s4.p': 'Review the diff Claude just made, stage, commit and push from the Git panel next to the chat. Switch branches from the status line.',
    'alt.s0': 'Two Claude sessions split side by side, with a workspace sidebar.',
    'alt.s1': 'A permission prompt in the chat asking to run git push, with Allow, Always in this project and Deny buttons.',
    'alt.s2': 'The slash command menu listing resume, clear, model, statusline, btw, rewind, context, effort, mode and rename.',
    'alt.s3': 'A TypeScript file open in the viewer above a zsh terminal showing git log and git status.',
    'alt.s4': 'The Git panel with two changed files and a diff, next to the chat that made the change.',
    'how.title': "It's your Claude Code. Just more of it.",
    'how.lede': "next-ide doesn't reimplement anything. It drives the <code>claude</code> binary you already have, through the official Agent SDK.",
    'how.flow': 'next-ide talks to the Agent SDK, which runs your claude CLI, which calls the Anthropic API',
    'how.yours': 'your claude',
    'how.api': 'Anthropic API',
    'how.f0.t': 'Your login',
    'how.f0.d': 'Pro, Max or an API key, whatever <code>claude</code> already uses. next-ide never sees or stores it.',
    'how.f1.t': 'Your setup',
    'how.f1.d': '<code>CLAUDE.md</code>, hooks, MCP servers, skills and permission rules load exactly like in the terminal.',
    'how.f2.t': 'Same speed',
    'how.f2.d': "Same model, same prompt cache. Sessions appear in the CLI's <code>/resume</code>, and the other way round.",
    'install.title': 'Install in a minute.',
    'install.s0': 'Have <a href="https://docs.claude.com/en/docs/claude-code">Claude Code</a> installed and logged in. Running <code>claude</code> in a terminal should work.',
    'install.s1': '<a href="https://github.com/thiagolopes-dev/next-ide/releases/latest">Download the DMG</a> for your Mac (Apple Silicon or Intel) and drag next-ide to Applications. It\'s signed and notarized, so it opens like any app.',
    'install.s2': "Create a workspace, add a project folder and press <kbd>▶</kbd>. That's a Claude session.",
    'install.src': 'Rather build it yourself?',
    copy: 'Copy',
    copied: 'Copied',
    press: 'Press ⌘C',
    'faq.title': 'Questions.',
    'faq.q0': 'Is it slower than the CLI?',
    'faq.a0': 'No. Each session is your own <code>claude</code> running behind the Agent SDK, so answers take as long as in the terminal. The first message in a new tab waits a second or two while the CLI starts and loads your MCP servers.',
    'faq.q1': 'Does it need a subscription?',
    'faq.a1': 'It needs whatever Claude Code needs. If <code>claude</code> works in your terminal, with a Pro or Max plan or an API key, next-ide works too.',
    'faq.q2': 'Where does my data go?',
    'faq.a2': 'Nowhere new. No accounts, no servers, no telemetry. Workspaces and settings stay on your Mac; conversations are stored by Claude Code in <code>~/.claude</code>.',
    'faq.q3': 'Windows or Linux?',
    'faq.a3': 'Not yet. The app is macOS-only for now. The code is MIT, and pull requests are welcome.',
    'foot.line': 'Many projects. One window. Your Claude.',
    'foot.security': 'Security',
    'foot.license': 'MIT License',
    'foot.legal': 'An independent project by Thiago Lopes. Not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic, PBC.',
    'meta.title': 'next-ide — every Claude Code session, one window',
    'meta.description': 'A native macOS IDE that runs your own Claude Code across all your projects, side by side. Chat, split panes, terminal, files and Git. Free and open source.',
  }

  const PT_EXTRA = { copied: 'Copiado', press: 'Use ⌘C' }
  const PT = {}
  const metaDesc = () => document.querySelector('meta[name="description"]')

  // Snapshot the Portuguese originals once, from the page itself.
  const snapshot = () => {
    document.querySelectorAll('[data-i18n]').forEach((el) => { PT[el.dataset.i18n] ??= el.innerHTML })
    document.querySelectorAll('[data-i18n-alt]').forEach((el) => { PT[el.dataset.i18nAlt] ??= el.getAttribute('alt') })
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { PT[el.dataset.i18nAria] ??= el.getAttribute('aria-label') })
    PT['meta.title'] = document.title
    PT['meta.description'] = metaDesc()?.getAttribute('content') ?? ''
    Object.assign(PT, PT_EXTRA)
  }

  const t = (lang, key) => (lang === 'en' ? EN : PT)[key]

  const apply = (lang) => {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const v = t(lang, el.dataset.i18n)
      if (v != null) el.innerHTML = v
    })
    document.querySelectorAll('[data-i18n-alt]').forEach((el) => {
      const v = t(lang, el.dataset.i18nAlt)
      if (v != null) el.setAttribute('alt', v)
    })
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      const v = t(lang, el.dataset.i18nAria)
      if (v != null) el.setAttribute('aria-label', v)
    })
    document.title = t(lang, 'meta.title')
    metaDesc()?.setAttribute('content', t(lang, 'meta.description'))
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'
    document.querySelectorAll('.lang__btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)))
    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang } }))
  }

  const saved = () => {
    try { return localStorage.getItem(KEY) === 'en' ? 'en' : 'pt' } catch { return 'pt' }
  }

  window.nextIdeI18n = { t: (key) => t(document.documentElement.lang === 'en' ? 'en' : 'pt', key) }

  window.addEventListener('DOMContentLoaded', () => {
    snapshot()
    const lang = saved()
    if (lang === 'en') apply('en')
    document.querySelectorAll('.lang__btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const next = btn.dataset.lang === 'en' ? 'en' : 'pt'
        try { localStorage.setItem(KEY, next) } catch {}
        apply(next)
      })
    })
  })
})()
