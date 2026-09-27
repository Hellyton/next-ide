// next-ide dictation helper: captures the microphone, transcribes on-device with SpeechAnalyzer,
// and prints one JSON object per line on stdout. SIGTERM/SIGINT finalizes and exits 0.
import AVFoundation
import Foundation
import Speech

func emit(_ object: [String: String]) {
  guard let data = try? JSONSerialization.data(withJSONObject: object),
        let line = String(data: data, encoding: .utf8) else { return }
  print(line)
  fflush(stdout)
}

func fail(_ message: String) -> Never {
  emit(["type": "error", "message": message])
  exit(1)
}

func localeArgument() -> Locale {
  let args = CommandLine.arguments
  if let i = args.firstIndex(of: "--locale"), i + 1 < args.count { return Locale(identifier: args[i + 1]) }
  return Locale(identifier: "pt-BR")
}

@available(macOS 26.0, *)
final class Dictation {
  private let engine = AVAudioEngine()
  private var analyzer: SpeechAnalyzer?
  private var input: AsyncStream<AnalyzerInput>.Continuation?
  private var results: Task<Void, Error>?
  private var converter: AVAudioConverter?
  private var format: AVAudioFormat?
  private var finalText = ""
  private var volatileText = ""
  private var stopping = false

  func run(locale requested: Locale) async throws {
    if AVCaptureDevice.authorizationStatus(for: .audio) != .authorized {
      let granted = await AVCaptureDevice.requestAccess(for: .audio)
      if !granted { fail("Permissão de microfone negada. Libere em Ajustes do Sistema > Privacidade e Segurança > Microfone.") }
    }
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requested) else {
      fail("Idioma \(requested.identifier) não suportado pelo ditado do macOS.")
    }
    let transcriber = SpeechTranscriber(locale: locale, transcriptionOptions: [], reportingOptions: [.volatileResults], attributeOptions: [])
    if let request = try await AssetInventory.assetInstallationRequest(supporting: [transcriber]) {
      emit(["type": "status", "text": "baixando modelo de fala…"])
      try await request.downloadAndInstall()
    }
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    self.analyzer = analyzer
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber]) else {
      fail("Formato de áudio indisponível para o ditado.")
    }
    self.format = format
    let (stream, continuation) = AsyncStream<AnalyzerInput>.makeStream()
    input = continuation

    results = Task {
      for try await result in transcriber.results {
        let text = String(result.text.characters)
        if result.isFinal {
          self.finalText = Self.join(self.finalText, text)
          self.volatileText = ""
        } else {
          self.volatileText = self.finalText.isEmpty ? text : Self.join("", text, leadingSpace: true)
        }
        self.emitTranscript()
      }
    }

    try await analyzer.start(inputSequence: stream)

    let node = engine.inputNode
    let micFormat = node.outputFormat(forBus: 0)
    guard micFormat.sampleRate > 0 else { fail("Nenhum microfone encontrado.") }
    converter = AVAudioConverter(from: micFormat, to: format)
    converter?.primeMethod = .none
    node.installTap(onBus: 0, bufferSize: 4096, format: micFormat) { [weak self] buffer, _ in
      guard let self, let converted = self.convert(buffer) else { return }
      self.input?.yield(AnalyzerInput(buffer: converted))
    }
    engine.prepare()
    try engine.start()
    emit(["type": "ready"])
  }

  func stop() async {
    if stopping { return }
    stopping = true
    engine.stop()
    engine.inputNode.removeTap(onBus: 0)
    input?.finish()
    try? await analyzer?.finalizeAndFinishThroughEndOfInput()
    _ = try? await results?.value
    volatileText = ""
    emitTranscript()
    exit(0)
  }

  private func emitTranscript() {
    emit(["type": "transcript", "final": finalText, "volatile": volatileText])
  }

  private static func join(_ base: String, _ piece: String, leadingSpace: Bool = false) -> String {
    let trimmed = piece.trimmingCharacters(in: .whitespaces)
    if trimmed.isEmpty { return base }
    if base.isEmpty { return leadingSpace ? " " + trimmed : trimmed }
    return base + " " + trimmed
  }

  private func convert(_ buffer: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
    guard let converter, let format else { return nil }
    let ratio = format.sampleRate / buffer.format.sampleRate
    let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 1
    guard let out = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity) else { return nil }
    var consumed = false
    var error: NSError?
    converter.convert(to: out, error: &error) { _, status in
      if consumed {
        status.pointee = .noDataNow
        return nil
      }
      consumed = true
      status.pointee = .haveData
      return buffer
    }
    return error == nil ? out : nil
  }
}

// Swift's availability checker does not narrow a top-level `guard #available(...) else { fail(...) }`
// even though `fail` returns Never (this only works inside a function body), so macOS 26 APIs below
// still read as unavailable at top level. Wrapping in `if/else` instead makes the branch's
// availability visible to the compiler; the stdout protocol and exit behavior are unchanged.
if #available(macOS 26.0, *) {
  let dictation = Dictation()
  var signalSources: [DispatchSourceSignal] = []
  for sig in [SIGTERM, SIGINT] {
    signal(sig, SIG_IGN)
    let source = DispatchSource.makeSignalSource(signal: sig, queue: .main)
    source.setEventHandler { Task { await dictation.stop() } }
    source.resume()
    signalSources.append(source)
  }
  Task {
    do {
      try await dictation.run(locale: localeArgument())
    } catch {
      fail("Falha no ditado: \(error.localizedDescription)")
    }
  }
  dispatchMain()
} else {
  fail("O ditado precisa do macOS 26 ou mais novo.")
}
