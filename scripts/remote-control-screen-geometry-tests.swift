// Combined with the actual source helper declarations by remote-control-geometry-check.py.
// Synthetic in-memory buffers only: no SCStream, frame files, or OS input.
@main
struct GeometryChecks {
    static func main() throws {
        var count = 0
        let display = DisplaySnapshot(
            id: 2, bounds: CGRect(x: 0, y: 0, width: 1920, height: 1080),
            pixelWidth: 3840, pixelHeight: 2160, modeWidth: 1920, modeHeight: 1080, rotation: 0)

        func buffer(_ width: Int = 1280, _ height: Int = 720) -> CVPixelBuffer {
            var result: CVPixelBuffer?
            precondition(CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32BGRA, nil, &result) == kCVReturnSuccess)
            return result!
        }
        func info(_ rect: CGRect, _ scale: CGFloat = 1.0 / 3.0, _ factor: CGFloat = 2) -> [SCStreamFrameInfo: Any] {
            [.contentRect: rect.dictionaryRepresentation, .contentScale: scale, .scaleFactor: factor]
        }

        let full = info(CGRect(x: 0, y: 0, width: 640, height: 360))
        let observed = try CapturedLayout.observed(buffer(), full, display)
        precondition(observed.contentRect == CGRect(x: 0, y: 0, width: 1280, height: 720))
        count += 1

        let boxed = try CapturedLayout.observed(buffer(), info(CGRect(x: 80, y: 45, width: 480, height: 270), 0.25), display)
        precondition(boxed.contentRect == CGRect(x: 160, y: 90, width: 960, height: 540))
        count += 1

        let fractional = try CapturedLayout.observed(buffer(), info(CGRect(x: 80.25, y: 45.5, width: 480, height: 270), 0.25), display)
        precondition(fractional.contentRect.origin == CGPoint(x: 160.5, y: 91))
        count += 1

        let rotated = DisplaySnapshot(
            id: 2, bounds: CGRect(x: 0, y: 0, width: 1080, height: 1920),
            pixelWidth: 2160, pixelHeight: 3840, modeWidth: 1920, modeHeight: 1080, rotation: 90)
        let portrait = try CapturedLayout.observed(buffer(), info(CGRect(x: 100, y: 0, width: 202.5, height: 360), 0.1875), rotated)
        precondition(portrait.contentRect == CGRect(x: 200, y: 0, width: 405, height: 720))
        count += 1

        let invalid: [[SCStreamFrameInfo: Any]] = [
            [:],
            info(CGRect(x: 0, y: 0, width: 639, height: 360)),
            info(CGRect(x: 500, y: 0, width: 640, height: 360)),
            info(CGRect(x: 0, y: 0, width: -640, height: 360)),
            info(CGRect(x: 0, y: 0, width: 640, height: 360), 0),
            info(CGRect(x: 0, y: 0, width: 640, height: 360), .infinity),
            info(CGRect(x: 0, y: 0, width: 640, height: 360), 1.0 / 3.0, 1),
            info(CGRect(x: 0, y: 0, width: 640, height: 360), 1.0 / 3.0, .nan),
        ]
        for value in invalid {
            do {
                _ = try CapturedLayout.observed(buffer(), value, display)
                fatalError("Invalid capture geometry was accepted")
            } catch { count += 1 }
        }
        do {
            _ = try CapturedLayout.observed(buffer(1278, 720), full, display)
            fatalError("Mismatched pixel buffer dimensions were accepted")
        } catch { count += 1 }
        precondition(count == 13)
        print("Pure Swift geometry checks passed: \(count)")
    }
}
