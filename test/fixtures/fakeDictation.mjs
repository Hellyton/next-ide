// Stand-in for the Swift dictation helper in E2E (NEXT_IDE_E2E_FAKE_DICTATION=ok|error).
// Same stdout protocol; no microphone.
const mode = process.argv[2] ?? 'ok'
const emit = (o) => process.stdout.write(`${JSON.stringify(o)}\n`)

if (mode === 'error') {
  emit({ type: 'error', message: 'Permissão de microfone negada.' })
  process.exit(1)
}

emit({ type: 'ready' })
setTimeout(() => emit({ type: 'transcript', final: '', volatile: 'abre o' }), 50)
setTimeout(() => emit({ type: 'transcript', final: 'abre o arquivo', volatile: '' }), 100)
const finish = () => {
  emit({ type: 'transcript', final: 'abre o arquivo de config', volatile: '' })
  process.exit(0)
}
process.on('SIGTERM', finish)
process.on('SIGINT', finish)
setInterval(() => undefined, 1000)
