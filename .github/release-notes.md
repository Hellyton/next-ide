## Install

1. Download `next-ide-<version>-arm64.dmg` below (Apple Silicon Macs).
2. Open the DMG and drag **next-ide** to **Applications**.
3. The app is not notarized by Apple yet, so macOS blocks the first launch. Clear the quarantine flag once:

   ```bash
   xattr -dr com.apple.quarantine /Applications/next-ide.app
   ```

You need [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and logged in (`claude` in your terminal). next-ide drives your own `claude` binary; it never sees or stores your credentials.
