// Included with the production helpers by remote-control-encoder-check.py.
// Only synthetic buffers are encoded; no screen capture, input, or frame files.
private final class EncodedSamples {
    let lock = NSLock()
    var frames = 0
    var bytes = 0
    var failures = 0
    var profile: [UInt8] = []
    var timestamps: [Int64] = []

    func receive(_ status: OSStatus, _ sample: CMSampleBuffer?) {
        lock.lock()
        defer { lock.unlock() }
        guard status == noErr, let sample, CMSampleBufferDataIsReady(sample),
              let data = sample.dataBuffer, let format = sample.formatDescription else { failures += 1; return }
        frames += 1
        bytes += CMBlockBufferGetDataLength(data)
        timestamps.append(CMTimeConvertScale(sample.presentationTimeStamp, timescale: 15, method: .default).value)
        var sps: UnsafePointer<UInt8>?
        var size = 0
        if CMVideoFormatDescriptionGetH264ParameterSetAtIndex(format, parameterSetIndex: 0,
            parameterSetPointerOut: &sps, parameterSetSizeOut: &size,
            parameterSetCountOut: nil, nalUnitHeaderLengthOut: nil) == noErr, let sps, size >= 4 {
            if !supportedH264SPS(sps, count: size) { failures += 1 }
            profile = Array(UnsafeBufferPointer(start: sps + 1, count: 3))
        }
    }
}

private func check(_ condition: @autoclosure () -> Bool, _ message: String) throws {
    if !condition() { throw NSError(domain: message, code: 1) }
}

@main
struct EncoderRegression {
    static func encode(forceFallback: Bool) throws -> [String: Any] {
        let output = EncodedSamples()
        var attempts: [H264EncoderMode] = []
        let started = DispatchTime.now().uptimeNanoseconds
        let (session, mode) = try selectH264Encoder { mode in
            attempts.append(mode)
            if forceFallback && mode == .hardware { throw NSError(domain: "SyntheticHardwareUnavailable", code: -12915) }
            return try createH264Encoder(mode, callback: { context, _, status, _, sample in
                guard let context else { return }
                Unmanaged<EncodedSamples>.fromOpaque(context).takeUnretainedValue().receive(status, sample)
            }, context: Unmanaged.passUnretained(output).toOpaque())
        }
        defer { VTCompressionSessionInvalidate(session) }
        if forceFallback { try check(mode == .software && attempts == [.hardware, .software], "SoftwareFallbackNotSelected") }
        for index in 0..<15 {
            var buffer: CVPixelBuffer?
            let attributes = [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary
            let status = CVPixelBufferCreate(nil, width, height, kCVPixelFormatType_32BGRA, attributes, &buffer)
            guard status == kCVReturnSuccess, let buffer else { throw NSError(domain: "SyntheticBuffer", code: Int(status)) }
            CVPixelBufferLockBaseAddress(buffer, [])
            if let address = CVPixelBufferGetBaseAddress(buffer) {
                memset(address, Int32(index * 13), CVPixelBufferGetBytesPerRow(buffer) * height)
            }
            CVPixelBufferUnlockBaseAddress(buffer, [])
            let encoded = VTCompressionSessionEncodeFrame(session, imageBuffer: buffer,
                presentationTimeStamp: CMTime(value: Int64(index), timescale: 15),
                duration: CMTime(value: 1, timescale: 15), frameProperties: nil,
                sourceFrameRefcon: nil, infoFlagsOut: nil)
            try check(encoded == noErr, "SyntheticFrameRejected")
        }
        try check(VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid) == noErr, "EncoderDrainFailed")
        output.lock.lock()
        defer { output.lock.unlock() }
        try check(output.frames == 15 && output.bytes > 0 && output.failures == 0, "IncompleteH264Output")
        try check(output.timestamps == Array(0..<15).map(Int64.init), "OutputReordered")
        try check(output.profile.count == 3 && output.profile[0] == 66
                  && output.profile[1] & 0x4f == 0x40 && output.profile[2] == 31, "UnexpectedH264Profile")
        return ["mode": mode.rawValue, "frames": output.frames, "bytes": output.bytes,
                "profileLevelId": output.profile.map { String(format: "%02x", $0) }.joined(),
                "elapsedMs": (DispatchTime.now().uptimeNanoseconds - started) / 1_000_000]
    }

    static func main() throws {
        let spsCases: [([UInt8], Int, Bool)] = [
            ([0x67, 0x42, 0xc0, 0x1f], 4, true),
            ([0x67, 0x42, 0xe0, 0x1f], 4, true),
            ([0x67, 0x42, 0x40, 0x1f], 4, true),
            ([0x67, 0x42, 0xe0, 0x1f], 0, false),
            ([0x67, 0x42, 0xe0, 0x1f], 3, false),
            ([0x68, 0x42, 0xe0, 0x1f], 4, false),
            ([0x67, 0x42, 0x00, 0x1f], 4, false),
            ([0x67, 0x4d, 0xe0, 0x1f], 4, false),
            ([0x67, 0x64, 0xe0, 0x1f], 4, false),
            ([0x67, 0x42, 0xe1, 0x1f], 4, false),
            ([0x67, 0x42, 0xe0, 0x1e], 4, false),
            ([0x67, 0x42, 0xe0, 0x20], 4, false),
        ]
        for (index, item) in spsCases.enumerated() {
            let (bytes, count, expected) = item
            let accepted = bytes.withUnsafeBufferPointer { supportedH264SPS($0.baseAddress!, count: count) }
            try check(accepted == expected, "UnexpectedSPSAcceptance_\(index)")
        }
        var attempts: [H264EncoderMode] = []
        let (first, mode) = try selectH264Encoder { mode in attempts.append(mode); return 7 }
        try check(first == 7 && mode == .hardware && attempts == [.hardware], "HealthyHardwareRetried")
        attempts = []
        do {
            let _: (Int, H264EncoderMode) = try selectH264Encoder { mode in
                attempts.append(mode)
                throw NSError(domain: "Unavailable", code: 1)
            }
            throw NSError(domain: "BothEncoderFailuresAccepted", code: 1)
        } catch {
            try check((error as NSError).domain == "H264_ENCODER_UNAVAILABLE" && attempts == [.hardware, .software], "EncoderRetryNotBounded")
        }
        let automatic = try encode(forceFallback: false)
        let fallback = try encode(forceFallback: true)
        let result: [String: Any] = ["tests": 5, "spsCases": spsCases.count, "syntheticOnly": true, "framesStored": 0,
                                     "automatic": automatic, "hardwareFailureFallback": fallback]
        let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
        print(String(decoding: data, as: UTF8.self))
    }
}
