// M0 probe only. Screen frames remain in memory and are never saved/transmitted.
// This executable is not bundled with or exposed to the Tauri webview.
import AppKit
import CoreGraphics
import CoreMedia
import CoreVideo
import Foundation
import ScreenCaptureKit
import VideoToolbox

@available(macOS 13.0, *)
final class FrameSink: NSObject, SCStreamOutput {
    private let lock = NSLock()
    private var frameSize: [Int]?
    private var firstPixelBuffer: CVPixelBuffer?

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sampleBuffer.isValid,
              let buffer = sampleBuffer.imageBuffer,
              let attachments = CMSampleBufferGetSampleAttachmentsArray(sampleBuffer, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let rawStatus = attachments.first?[.status] as? Int,
              SCFrameStatus(rawValue: rawStatus) == .complete else { return }
        lock.lock()
        frameSize = [CVPixelBufferGetWidth(buffer), CVPixelBufferGetHeight(buffer)]
        if firstPixelBuffer == nil { firstPixelBuffer = buffer }
        lock.unlock()
    }

    func dimensions() -> [Int]? {
        lock.lock()
        defer { lock.unlock() }
        return frameSize
    }

    func pixelBuffer() -> CVPixelBuffer? {
        lock.lock()
        defer { lock.unlock() }
        return firstPixelBuffer
    }
}

final class EncodedFrame {
    var status: OSStatus = -1
    var bytes = 0
    var profileLevelId = "unknown"
    var parameterSets = 0
    var nalLengthBytes: Int32 = 0
}

@main
struct NativeProbe {
    static func emit(_ values: [String: Any]) {
        if let data = try? JSONSerialization.data(withJSONObject: values, options: [.sortedKeys]),
           let line = String(data: data, encoding: .utf8) { print(line) }
    }

    static func encode(_ buffer: CVPixelBuffer) {
        let result = EncodedFrame()
        var session: VTCompressionSession?
        let status = VTCompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            width: Int32(CVPixelBufferGetWidth(buffer)),
            height: Int32(CVPixelBufferGetHeight(buffer)),
            codecType: kCMVideoCodecType_H264,
            encoderSpecification: [kVTVideoEncoderSpecification_RequireHardwareAcceleratedVideoEncoder: true] as CFDictionary,
            imageBufferAttributes: nil, compressedDataAllocator: nil,
            outputCallback: { context, _, status, _, sample in
                guard let context else { return }
                let result = Unmanaged<EncodedFrame>.fromOpaque(context).takeUnretainedValue()
                result.status = status
                guard status == noErr, let sample, let data = sample.dataBuffer,
                      let format = sample.formatDescription else { return }
                result.bytes = CMBlockBufferGetDataLength(data)
                var pointer: UnsafePointer<UInt8>?
                var size = 0
                let parameterStatus = CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
                    format, parameterSetIndex: 0, parameterSetPointerOut: &pointer,
                    parameterSetSizeOut: &size, parameterSetCountOut: &result.parameterSets,
                    nalUnitHeaderLengthOut: &result.nalLengthBytes)
                if parameterStatus == noErr, let pointer, size >= 4 {
                    result.profileLevelId = [pointer[1], pointer[2], pointer[3]].map { String(format: "%02x", $0) }.joined()
                }
            }, refcon: Unmanaged.passUnretained(result).toOpaque(), compressionSessionOut: &session)
        guard status == noErr, let session else {
            emit(["encode": "failed", "stage": "create-hardware-session", "status": status])
            return
        }
        defer { VTCompressionSessionInvalidate(session) }
        let properties: [(CFString, CFTypeRef)] = [
            (kVTCompressionPropertyKey_RealTime, kCFBooleanTrue),
            (kVTCompressionPropertyKey_AllowFrameReordering, kCFBooleanFalse),
            (kVTCompressionPropertyKey_ProfileLevel, kVTProfileLevel_H264_Baseline_AutoLevel),
            (kVTCompressionPropertyKey_AverageBitRate, NSNumber(value: 1_000_000)),
        ]
        for (key, value) in properties {
            let propertyStatus = VTSessionSetProperty(session, key: key, value: value)
            guard propertyStatus == noErr else {
                emit(["encode": "failed", "stage": "configure", "status": propertyStatus])
                return
            }
        }
        var info: VTEncodeInfoFlags = []
        let encodeStatus = VTCompressionSessionEncodeFrame(
            session, imageBuffer: buffer, presentationTimeStamp: .zero,
            duration: CMTime(value: 1, timescale: 30),
            frameProperties: [kVTEncodeFrameOptionKey_ForceKeyFrame: true] as CFDictionary,
            sourceFrameRefcon: nil, infoFlagsOut: &info)
        let completionStatus = VTCompressionSessionCompleteFrames(session, untilPresentationTimeStamp: .invalid)
        var hardware: UnsafeRawPointer?
        VTSessionCopyProperty(session, key: kVTCompressionPropertyKey_UsingHardwareAcceleratedVideoEncoder,
                              allocator: nil, valueOut: &hardware)
        let hardwareValue = hardware.map { Unmanaged<AnyObject>.fromOpaque($0).takeRetainedValue() as? Bool } ?? false
        emit(["encode": encodeStatus == noErr && completionStatus == noErr && result.status == noErr && result.bytes > 0 ? "passed" : "failed",
              "codec": "H264", "hardware": hardwareValue ?? false,
              "profileLevelId": result.profileLevelId, "parameterSets": result.parameterSets,
              "nalLengthBytes": result.nalLengthBytes, "encodedBytes": result.bytes,
              "status": result.status, "encodeStatus": encodeStatus, "completionStatus": completionStatus,
              "framesStored": 0, "mediaTransportTested": false])
    }

    static func main() async {
        let screenGranted = CGPreflightScreenCaptureAccess()
        let inputGranted = AXIsProcessTrusted()
        // Creating an event without posting verifies SDK construction only; it
        // does not establish injection/UIPI/trusted-local-consent correctness.
        let eventConstructed = CGEvent(keyboardEventSource: nil, virtualKey: 0, keyDown: false) != nil
        emit(["probe": "macos-native-apis", "screenCaptureGranted": screenGranted,
              "inputControlGranted": inputGranted, "inputEventConstructed": eventConstructed,
              "inputEventPosted": false])

        let encodeRequested = CommandLine.arguments.contains("--encode-one-frame")
        guard CommandLine.arguments.contains("--capture-one-frame") || encodeRequested else {
            emit(["capture": "not-requested"])
            return
        }
        // Never call a request-permission API or start capture without preflight.
        guard screenGranted else {
            emit(["capture": "blocked", "reason": "SCREEN_PERMISSION_NOT_GRANTED"])
            return
        }
        guard #available(macOS 13.0, *) else {
            emit(["capture": "blocked", "reason": "PLATFORM_UNSUPPORTED"])
            return
        }
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
            guard let display = content.displays.first else {
                emit(["capture": "blocked", "reason": "NO_DISPLAY"])
                return
            }
            let config = SCStreamConfiguration()
            config.width = 320
            config.height = 180
            config.queueDepth = 3
            config.capturesAudio = false
            config.showsCursor = true
            config.minimumFrameInterval = CMTime(value: 1, timescale: 5)
            let stream = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: config, delegate: nil)
            let sink = FrameSink()
            try stream.addStreamOutput(sink, type: .screen, sampleHandlerQueue: DispatchQueue(label: "todesk.native-probe"))
            try await stream.startCapture()
            var dimensions: [Int]?
            for _ in 0..<30 {
                try await Task.sleep(nanoseconds: 100_000_000)
                dimensions = sink.dimensions()
                if dimensions != nil { break }
            }
            try await stream.stopCapture()
            if let dimensions {
                emit(["capture": "passed", "width": dimensions[0], "height": dimensions[1],
                      "framesStored": 0, "mediaTransportTested": false])
                if encodeRequested, let buffer = sink.pixelBuffer() { encode(buffer) }
            } else {
                emit(["capture": "failed", "reason": "NO_COMPLETE_FRAME_WITHIN_3_SECONDS"])
            }
        } catch {
            // No screen contents, window names, device identifiers or credentials.
            emit(["capture": "failed", "error": String(describing: error)])
        }
    }
}
