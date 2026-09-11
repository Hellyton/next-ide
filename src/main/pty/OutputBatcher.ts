export class OutputBatcher {
  private buffer = ''
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly out: (chunk: string) => void,
    private readonly ms = 16,
  ) {}

  push(chunk: string): void {
    this.buffer += chunk
    if (!this.timer) this.timer = setTimeout(() => this.flush(), this.ms)
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (!this.buffer) return
    const chunk = this.buffer
    this.buffer = ''
    this.out(chunk)
  }
}
