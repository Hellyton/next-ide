// next-ide site: scroll-synced tour and the copy button. No dependencies.
window.addEventListener('DOMContentLoaded', () => {
  const steps = [...document.querySelectorAll('.tour__step')]
  const shots = [...document.querySelectorAll('.tour__shot')]

  const activate = (index) => {
    for (const el of [...steps, ...shots]) el.classList.toggle('is-active', el.dataset.step === String(index))
  }
  activate(0)

  // Small screens drop the sticky pane: give each screenshot its step's text instead.
  shots.forEach((shot, i) => {
    const cap = shot.querySelector('figcaption')
    const step = steps[i]
    if (cap && step) cap.innerHTML = step.innerHTML
  })

  // The screenshot crossing the middle band of the viewport drives the sticky pane.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) activate(entry.target.dataset.step)
      },
      { rootMargin: '-45% 0px -45% 0px' },
    )
    shots.forEach((shot) => io.observe(shot))
  }

  // Clicking a step scrolls its screenshot into view.
  steps.forEach((step) => {
    step.addEventListener('click', () => shots[Number(step.dataset.step)]?.scrollIntoView({ block: 'center' }))
  })

  // Copy: silent success, label flips to "Copied" and back.
  document.querySelectorAll('.copy').forEach((btn) => {
    const label = btn.querySelector('.copy__label')
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy)
        btn.classList.add('is-done')
        label.textContent = 'Copied'
      } catch {
        label.textContent = 'Press ⌘C'
      }
      setTimeout(() => {
        btn.classList.remove('is-done')
        label.textContent = 'Copy'
      }, 1600)
    })
  })
})
