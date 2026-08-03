import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Flashlight, RefreshCw } from "lucide-react";
import { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType } from "@zxing/library";
import "../styles/cameraScanner.css";

/**
 * Camera barcode reader for the counter.
 *
 * Most sites have no handheld scanner, so the phone or laptop camera has to be
 * a first-class way in. Two decode engines, best first:
 *
 * 1. The browser's native BarcodeDetector (Chrome/Edge). It is the same
 *    platform decoder the "working" scanner sites use — much better at 1D
 *    codes like our Code 128 labels than any JS port.
 * 2. ZXing as the fallback everywhere else (Safari, Firefox).
 *
 * Either way the camera is opened by us at HD resolution with continuous
 * focus. This matters more than the decoder: the default getUserMedia stream
 * is 640×480, and at that size the bars of a Code 128 label blur together —
 * which reads as "the scanner never scans".
 *
 * A camera can only be opened in a secure context — https, or localhost during
 * development. Opening the app over a plain-http LAN address silently kills
 * `getUserMedia`, which looks exactly like "nothing happens", so that case is
 * named explicitly rather than left to a generic error.
 */
const ZXING_FORMATS = [
  BarcodeFormat.CODE_128, // what this ERP prints
  BarcodeFormat.CODE_39,
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
];

const NATIVE_FORMATS = [
  "code_128", "code_39", "ean_13", "ean_8", "upc_a", "upc_e",
  "itf", "codabar", "qr_code", "data_matrix",
];

const zxingHints = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, ZXING_FORMATS],
  [DecodeHintType.TRY_HARDER, true],
]);

const isSecure = () =>
  typeof window !== "undefined" &&
  (window.isSecureContext ||
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));

/**
 * The native detector exists on some platforms but without 1D support, so the
 * format list has to be checked, not just the constructor.
 */
async function makeNativeDetector() {
  if (!("BarcodeDetector" in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
    if (!formats.includes("code_128")) return null;
    return new window.BarcodeDetector({ formats });
  } catch {
    return null;
  }
}

/** Short beep so the operator does not have to watch the screen. */
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 1180;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => ctx.close();
  } catch { /* audio is a nicety, never a blocker */ }
}

/**
 * @param onDetected  called with the decoded string for every accepted read
 * @param pauseMs    after an accepted read, nothing at all is scanned for this
 *                   long — one physical scan is one product, then a breath
 * @param regapMs    the same code is only accepted again after it has been out
 *                   of view this long, so a label held in front of the lens is
 *                   added once, not once per second
 */
function CameraScanner({ onDetected, pauseMs = 1000, regapMs = 1200, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const streamRef = useRef(null);
  const nativeTimerRef = useRef(null);
  const lastRef = useRef({ code: "", seenAt: 0 });
  const pausedUntilRef = useRef(0);
  const detectedRef = useRef(onDetected);
  detectedRef.current = onDetected;

  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceId] = useState(
    () => localStorage.getItem("scannerCameraId") || "",
  );
  const [status, setStatus] = useState("idle"); // idle | starting | live | error
  const [error, setError] = useState("");
  const [flash, setFlash] = useState(false);
  const [lastCode, setLastCode] = useState("");
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);

  /** One gate for both engines — pause after a read, re-gap for the same code. */
  const acceptCode = useCallback((rawCode) => {
    const code = String(rawCode || "").trim();
    if (!code) return;
    const now = Date.now();
    // The same label sitting in front of the lens reports every frame.
    // Keep refreshing `seenAt` so it is only accepted again once it has
    // actually left the view for a moment and come back — that is the
    // operator deliberately scanning it a second time.
    const stillInView =
      code === lastRef.current.code && now - lastRef.current.seenAt < regapMs;
    if (stillInView) lastRef.current.seenAt = now;
    // One scan, then a short breath: after an accepted read the scanner
    // ignores everything until the pause is over, so one physical scan
    // never turns into several products.
    if (stillInView || now < pausedUntilRef.current) return;
    lastRef.current = { code, seenAt: now };
    pausedUntilRef.current = now + pauseMs;
    setLastCode(code);
    setFlash(true);
    setTimeout(() => setFlash(false), pauseMs);
    beep();
    detectedRef.current?.(code);
  }, [pauseMs, regapMs]);

  const stop = useCallback(() => {
    if (nativeTimerRef.current) {
      clearInterval(nativeTimerRef.current);
      nativeTimerRef.current = null;
    }
    try { readerRef.current?.reset(); } catch { /* already gone */ }
    readerRef.current = null;
    // Stop our stream explicitly — we opened it, we close it; a mid-start
    // unmount must not leave the camera light on.
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const stream = videoRef.current?.srcObject;
    if (stream?.getTracks) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchOn(false);
    setHasTorch(false);
  }, []);

  /** Ask for permission once, then we can read real camera labels. */
  const listCameras = useCallback(async (requestPermission = false) => {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    if (requestPermission) {
      const probe = await navigator.mediaDevices.getUserMedia({ video: true });
      probe.getTracks().forEach((track) => track.stop());
    }
    const all = await navigator.mediaDevices.enumerateDevices();
    const cameras = all.filter((device) => device.kind === "videoinput");
    setDevices(cameras);
    return cameras;
  }, []);

  /**
   * Run the native detector against the live video on a timer. ~8 attempts a
   * second is plenty; the platform decoder is fast enough that this never
   * makes the page feel busy.
   */
  const runNativeLoop = useCallback((detector) => {
    let failures = 0;
    nativeTimerRef.current = setInterval(async () => {
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      try {
        const results = await detector.detect(video);
        failures = 0;
        if (results?.length) acceptCode(results[0].rawValue);
      } catch {
        // A platform decoder that keeps throwing is effectively absent
        // (e.g. detector exists but cannot take video frames) — hand the
        // stream to ZXing instead of failing silently forever.
        failures += 1;
        if (failures >= 5 && nativeTimerRef.current) {
          clearInterval(nativeTimerRef.current);
          nativeTimerRef.current = null;
          const reader = new BrowserMultiFormatReader(zxingHints, 120);
          readerRef.current = reader;
          if (streamRef.current && videoRef.current) {
            reader.decodeFromStream(streamRef.current, videoRef.current, (result) => {
              if (result) acceptCode(result.getText());
            }).catch(() => { /* stream already gone */ });
          }
        }
      }
    }, 130);
  }, [acceptCode]);

  const start = useCallback(async (preferredId) => {
    setError("");
    setStatus("starting");
    stop();

    if (!isSecure()) {
      setStatus("error");
      setError(
        `The camera only opens on a secure address. This page is on "${window.location.origin}" — use https, or open the app on localhost.`,
      );
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("error");
      setError("This browser cannot open a camera. Chrome, Edge or Safari will work.");
      return;
    }

    try {
      const cameras = await listCameras(true);
      if (!cameras.length) {
        setStatus("error");
        setError("No camera found on this device. Use the keyboard or Browse tab instead.");
        return;
      }

      // Prefer the saved camera, else a rear-facing one on a phone.
      const chosen =
        cameras.find((camera) => camera.deviceId === preferredId) ||
        cameras.find((camera) => /back|rear|environment/i.test(camera.label)) ||
        cameras[0];
      setDeviceId(chosen.deviceId);
      localStorage.setItem("scannerCameraId", chosen.deviceId);

      // HD or better: at 640×480 the bars of a Code 128 label are only a
      // couple of pixels wide and no decoder can separate them.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          deviceId: { exact: chosen.deviceId },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });
      streamRef.current = stream;

      const [track] = stream.getVideoTracks();
      const caps = track.getCapabilities?.() || {};
      // Phones support continuous autofocus; without it a label a hand-width
      // from the lens stays blurred and never decodes.
      if (Array.isArray(caps.focusMode) && caps.focusMode.includes("continuous")) {
        track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
      }
      setHasTorch(Boolean(caps.torch));

      const video = videoRef.current;
      if (!video) { stop(); return; }
      video.srcObject = stream;
      await video.play().catch(() => { /* autoplay is allowed for muted video */ });

      const native = await makeNativeDetector();
      if (native) {
        runNativeLoop(native);
      } else {
        const reader = new BrowserMultiFormatReader(zxingHints, 120);
        readerRef.current = reader;
        await reader.decodeFromStream(stream, video, (result) => {
          // Frames with no barcode arrive constantly and report a
          // NotFoundException — that is the normal state, not a failure, so
          // only a real result is acted on.
          if (result) acceptCode(result.getText());
        });
      }
      setStatus("live");
    } catch (err) {
      setStatus("error");
      const name = err?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Camera permission was blocked. Allow it from the padlock icon in the address bar, then press Retry.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setError("That camera is not available. Pick another one from the list.");
      } else if (name === "NotReadableError") {
        setError("Another app is already using the camera. Close it and press Retry.");
      } else {
        setError(err?.message || "Could not open the camera.");
      }
    }
  }, [acceptCode, listCameras, runNativeLoop, stop]);

  // `start` and `stop` are stable callbacks, so this opens the camera once and
  // releases it on unmount; switching camera or retrying calls `start` directly.
  useEffect(() => {
    start(localStorage.getItem("scannerCameraId") || "");
    return stop;
  }, [start, stop]);

  const switchCamera = (id) => {
    localStorage.setItem("scannerCameraId", id);
    setDeviceId(id);
    start(id);
  };

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch { /* some devices report torch but refuse it */ }
  };

  return (
    <div className="cam-scanner">
      <div className={`cam-stage ${status === "live" ? "is-live" : ""} ${flash ? "is-hit" : ""}`}>
        <video ref={videoRef} muted playsInline autoPlay />

        {status === "live" && (
          <>
            <div className="cam-frame"><span /><span /><span /><span /></div>
            <div className="cam-laser" />
          </>
        )}

        {status === "starting" && (
          <div className="cam-overlay">
            <Camera size={30} />
            <p>Opening the camera…</p>
            <small>Allow camera access if the browser asks.</small>
          </div>
        )}

        {status === "error" && (
          <div className="cam-overlay cam-overlay-error">
            <CameraOff size={30} />
            <p>{error}</p>
            <button type="button" className="btn btn-secondary" onClick={() => start(deviceId)}>
              <RefreshCw size={15} /> Retry
            </button>
          </div>
        )}
      </div>

      <div className="cam-bar">
        {devices.length > 0 && (
          <select
            value={deviceId}
            onChange={(event) => switchCamera(event.target.value)}
            aria-label="Camera"
          >
            {devices.map((device, index) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        )}
        {hasTorch && (
          <button
            type="button"
            className={`btn btn-secondary cam-torch ${torchOn ? "is-on" : ""}`}
            onClick={toggleTorch}
            title="Flashlight"
          >
            <Flashlight size={15} /> {torchOn ? "Light off" : "Light on"}
          </button>
        )}
        <span className="cam-status">
          {status === "live"
            ? lastCode ? `Read ${lastCode}` : "Hold a barcode inside the frame"
            : status === "starting" ? "Starting…" : "Camera off"}
        </span>
        {onClose && (
          <button type="button" className="btn btn-secondary cam-close" onClick={() => { stop(); onClose(); }}>
            Stop camera
          </button>
        )}
      </div>
    </div>
  );
}

export default CameraScanner;
