import React, { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, RefreshCw } from "lucide-react";
import { BarcodeFormat, BrowserMultiFormatReader, DecodeHintType } from "@zxing/library";
import "../styles/cameraScanner.css";

/**
 * Camera barcode reader for the counter.
 *
 * Most sites have no handheld scanner, so the phone or laptop camera has to be
 * a first-class way in. This keeps the video running and reports every code it
 * reads; the caller decides what to do with it.
 *
 * A camera can only be opened in a secure context — https, or localhost during
 * development. Opening the app over a plain-http LAN address silently kills
 * `getUserMedia`, which looks exactly like "nothing happens", so that case is
 * named explicitly rather than left to a generic error.
 */
const FORMATS = [
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

const hints = new Map([
  [DecodeHintType.POSSIBLE_FORMATS, FORMATS],
  [DecodeHintType.TRY_HARDER, true],
]);

const isSecure = () =>
  typeof window !== "undefined" &&
  (window.isSecureContext ||
    ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname));

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
 * @param cooldownMs  how long the same code is ignored for, so one label held
 *                    in front of the lens is not added ten times a second
 */
function CameraScanner({ onDetected, cooldownMs = 1600, onClose }) {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const lastRef = useRef({ code: "", at: 0 });
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

  const stop = useCallback(() => {
    try { readerRef.current?.reset(); } catch { /* already gone */ }
    readerRef.current = null;
    // Belt and braces: ZXing normally releases the tracks, but a mid-start
    // unmount can leave the camera light on without this.
    const stream = videoRef.current?.srcObject;
    if (stream?.getTracks) stream.getTracks().forEach((track) => track.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
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

      // 120ms between attempts keeps a laptop responsive while still feeling instant.
      readerRef.current = new BrowserMultiFormatReader(hints, 120);
      await readerRef.current.decodeFromVideoDevice(
        chosen.deviceId,
        videoRef.current,
        (result) => {
          // Frames with no barcode arrive constantly and report a
          // NotFoundException — that is the normal state, not a failure, so
          // only a real result is acted on.
          if (!result) return;
          const code = String(result.getText() || "").trim();
          if (!code) return;
          const now = Date.now();
          if (code === lastRef.current.code && now - lastRef.current.at < cooldownMs) return;
          lastRef.current = { code, at: now };
          setLastCode(code);
          setFlash(true);
          setTimeout(() => setFlash(false), 260);
          beep();
          detectedRef.current?.(code);
        },
      );
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
  }, [cooldownMs, listCameras, stop]);

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
