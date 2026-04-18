import { useState, useEffect, useRef } from "react";
import { startDeviceOrientation, isVersionAtLeast } from "@/lib/telegram";

export interface DeviceOrientationState {
  /** Left/right tilt: negative = left, positive = right. Range –90..90. */
  gamma: number;
  /** Front/back tilt: negative = forward, positive = backward. Range –180..180. */
  beta: number;
  /** Compass heading. Range 0..360. */
  alpha: number;
  supported: boolean;
}

const ZERO: DeviceOrientationState = { gamma: 0, beta: 0, alpha: 0, supported: false };
const LERP = 0.12; // smoothing factor per frame (~60fps)

/**
 * Returns smoothed device orientation values.
 * Uses Telegram DeviceOrientation API (v8.0+) with a browser
 * deviceorientation event fallback.
 *
 * Values are lerp-smoothed every animation frame to prevent jitter.
 */
export function useTelegramOrientation(): DeviceOrientationState {
  const [state, setState] = useState<DeviceOrientationState>(ZERO);
  const rawRef  = useRef({ alpha: 0, beta: 0, gamma: 0 });
  const smoothRef = useRef({ alpha: 0, beta: 0, gamma: 0 });
  const rafRef  = useRef(0);
  const activeRef = useRef(false);

  useEffect(() => {
    // Check permission for browser API on iOS 13+
    const requestBrowserPermission = async () => {
      const DOE = DeviceOrientationEvent as unknown as {
        requestPermission?: () => Promise<string>;
      };
      if (typeof DOE.requestPermission === "function") {
        try {
          const result = await DOE.requestPermission();
          return result === "granted";
        } catch {
          return false;
        }
      }
      return true; // no permission needed on Android/desktop
    };

    const isTgSensor = isVersionAtLeast("8.0");

    const stopSensor = startDeviceOrientation((data) => {
      rawRef.current = data;
      if (!activeRef.current) {
        // first reading — snap smoothed values to raw so there's no initial drift
        smoothRef.current = { ...data };
        activeRef.current = true;
        setState({ ...data, supported: true });
      }
    }, 50);

    let stopRequested = false;

    // Smooth via RAF
    const smooth = () => {
      if (stopRequested) return;
      const r = rawRef.current;
      const s = smoothRef.current;

      // Lerp each axis
      s.alpha = lerpAngle(s.alpha, r.alpha, LERP);
      s.beta  = s.beta  + (r.beta  - s.beta)  * LERP;
      s.gamma = s.gamma + (r.gamma - s.gamma) * LERP;
      smoothRef.current = s;

      if (activeRef.current) {
        setState({ alpha: s.alpha, beta: s.beta, gamma: s.gamma, supported: true });
      }

      rafRef.current = requestAnimationFrame(smooth);
    };
    rafRef.current = requestAnimationFrame(smooth);

    // For browser (non-Telegram) path, request permission
    if (!isTgSensor) {
      requestBrowserPermission().then((granted) => {
        if (!granted) {
          // mark unsupported cleanly
          cancelAnimationFrame(rafRef.current);
          setState(ZERO);
        }
      });
    }

    return () => {
      stopRequested = true;
      cancelAnimationFrame(rafRef.current);
      stopSensor();
      activeRef.current = false;
    };
  }, []);

  return state;
}

/** Lerp for angles that wrap around 360°. */
function lerpAngle(a: number, b: number, t: number): number {
  let diff = ((b - a + 540) % 360) - 180;
  return (a + diff * t + 360) % 360;
}
