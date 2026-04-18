/**
 * Comprehensive Telegram Mini App SDK wrapper.
 *
 * The SDK is loaded via <script> in index.html, so `window.Telegram?.WebApp`
 * is available inside Telegram and undefined in a plain browser.
 *
 * All exports degrade gracefully: they no-op or return sensible defaults when
 * running outside Telegram so the app works in dev mode without changes.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

type ColorScheme = "light" | "dark";
type HapticStyle = "light" | "medium" | "heavy" | "rigid" | "soft";
type HapticNotification = "error" | "success" | "warning";
type HomeScreenStatus = "added" | "missed" | "unknown";
type BiometricType = "finger" | "face" | "unknown";

type WebAppEvent =
  | "themeChanged"
  | "viewportChanged"
  | "mainButtonClicked"
  | "secondaryButtonClicked"
  | "backButtonClicked"
  | "settingsButtonClicked"
  | "activated"
  | "deactivated"
  | "fullscreenChanged"
  | "fullscreenFailed"
  | "accelerometerChanged"
  | "gyroscopeChanged"
  | "deviceOrientationChanged"
  | "locationChanged"
  | "locationManagerUpdated"
  | "homeScreenAdded"
  | "homeScreenChecked"
  | "popupClosed"
  | "qrTextReceived"
  | "scanQrPopupClosed"
  | "clipboardTextReceived"
  | "contactRequested"
  | "writeAccessRequested"
  | "biometricManagerUpdated"
  | "biometricAuthRequested"
  | "biometricTokenUpdated"
  | "emojiStatusSet"
  | "emojiStatusFailed"
  | "emojiStatusAccessRequested"
  | "fileDownloadRequested"
  | "shareMessageSent"
  | "shareMessageFailed"
  | "invoiceClosed";

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface ThemeParams {
  bg_color?: string;
  secondary_bg_color?: string;
  bottom_bar_bg_color?: string;
  text_color?: string;
  hint_color?: string;
  link_color?: string;
  button_color?: string;
  button_text_color?: string;
  accent_text_color?: string;
  destructive_text_color?: string;
  header_bg_color?: string;
  section_bg_color?: string;
  section_header_text_color?: string;
  subtitle_text_color?: string;
}

interface SafeAreaInset {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// ── Sub-object interfaces ────────────────────────────────────────────────────

interface MiniButton {
  isVisible: boolean;
  setText(text: string): MiniButton;
  show(): MiniButton;
  hide(): MiniButton;
  enable(): MiniButton;
  disable(): MiniButton;
  showProgress(leaveActive?: boolean): MiniButton;
  hideProgress(): MiniButton;
  onClick(cb: () => void): MiniButton;
  offClick(cb: () => void): MiniButton;
  setParams(params: Record<string, unknown>): MiniButton;
}

interface BackButton {
  isVisible: boolean;
  show(): BackButton;
  hide(): BackButton;
  onClick(cb: () => void): BackButton;
  offClick(cb: () => void): BackButton;
}

interface SettingsButton {
  isVisible: boolean;
  show(): SettingsButton;
  hide(): SettingsButton;
}

interface CloudStorage {
  setItem(key: string, value: string, cb?: (err: string | null, ok: boolean) => void): void;
  getItem(key: string, cb: (err: string | null, value: string) => void): void;
  getItems(keys: string[], cb: (err: string | null, values: Record<string, string>) => void): void;
  removeItem(key: string, cb?: (err: string | null, ok: boolean) => void): void;
  removeItems(keys: string[], cb?: (err: string | null, ok: boolean) => void): void;
  getKeys(cb: (err: string | null, keys: string[]) => void): void;
}

interface DeviceStorage {
  setItem(key: string, value: string, cb?: (err: string | null, ok: boolean) => void): void;
  getItem(key: string, cb: (err: string | null, value: string) => void): void;
  removeItem(key: string, cb?: (err: string | null, ok: boolean) => void): void;
  clear(cb?: (err: string | null, ok: boolean) => void): void;
  keys(cb: (err: string | null, keys: string[]) => void): void;
}

interface SecureStorage {
  setItem(key: string, value: string, cb?: (err: string | null, ok: boolean) => void): void;
  getItem(key: string, cb: (err: string | null, value: string) => void): void;
  restoreItem(key: string, cb: (err: string | null, value: string) => void): void;
  removeItem(key: string, cb?: (err: string | null, ok: boolean) => void): void;
  clear(cb?: (err: string | null, ok: boolean) => void): void;
  keys(cb: (err: string | null, keys: string[]) => void): void;
}

interface Accelerometer {
  isStarted: boolean;
  x: number;
  y: number;
  z: number;
  start(params: { refresh_rate?: number }, cb?: (err: string | null) => void): void;
  stop(cb?: (err: string | null) => void): void;
}

interface Gyroscope {
  isStarted: boolean;
  x: number;
  y: number;
  z: number;
  start(params: { refresh_rate?: number }, cb?: (err: string | null) => void): void;
  stop(cb?: (err: string | null) => void): void;
}

interface DeviceOrientation {
  isStarted: boolean;
  absolute: boolean;
  alpha: number;
  beta: number;
  gamma: number;
  start(params: { refresh_rate?: number; need_absolute?: boolean }, cb?: (err: string | null) => void): void;
  stop(cb?: (err: string | null) => void): void;
}

interface LocationManager {
  isInited: boolean;
  isLocationAvailable: boolean;
  isAccessRequested: boolean;
  isAccessGranted: boolean;
  init(cb?: () => void): void;
  getLocation(cb: (data: LocationData | null) => void): void;
  openSettings(): void;
}

interface LocationData {
  latitude: number;
  longitude: number;
  altitude: number | null;
  course: number | null;
  speed: number | null;
  horizontal_accuracy: number | null;
  vertical_accuracy: number | null;
}

interface BiometricManager {
  isInited: boolean;
  isBiometricAvailable: boolean;
  biometricType: BiometricType;
  isAccessRequested: boolean;
  isAccessGranted: boolean;
  isBiometricTokenSaved: boolean;
  deviceId: string;
  init(cb?: () => void): void;
  requestAccess(params: { reason?: string }, cb: (granted: boolean) => void): void;
  authenticate(params: { reason?: string }, cb: (ok: boolean, token?: string) => void): void;
  updateBiometricToken(token: string, cb: (updated: boolean) => void): void;
  openSettings(): void;
}

interface PopupParams {
  title?: string;
  message: string;
  buttons?: Array<{ id?: string; type?: "default" | "ok" | "close" | "cancel" | "destructive"; text?: string }>;
}

interface ScanQrParams {
  text?: string;
}

interface DownloadFileParams {
  url: string;
  file_name: string;
}

interface WebApp {
  // Core
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  version: string;
  platform: string;
  colorScheme: ColorScheme;
  themeParams: ThemeParams;
  isActive: boolean;
  isExpanded: boolean;
  isFullscreen: boolean;
  isOrientationLocked: boolean;
  isVerticalSwipesEnabled: boolean;
  viewportHeight: number;
  viewportStableHeight: number;
  headerColor: string;
  backgroundColor: string;
  bottomBarColor: string;
  safeAreaInset: SafeAreaInset;
  contentSafeAreaInset: SafeAreaInset;

  // Lifecycle
  ready(): void;
  expand(): void;
  close(): void;
  sendData(data: string): void;

  // Events
  onEvent(event: WebAppEvent, handler: () => void): void;
  offEvent(event: WebAppEvent, handler: () => void): void;

  // Version guard
  isVersionAtLeast(version: string): boolean;

  // Colors / chrome
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor(color: string): void;

  // Fullscreen (v8.0+)
  requestFullscreen(): void;
  exitFullscreen(): void;

  // Orientation (v8.0+)
  lockOrientation(): void;
  unlockOrientation(): void;

  // Swipe (v7.7+)
  enableVerticalSwipes(): void;
  disableVerticalSwipes(): void;

  // Closing confirmation
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;

  // Buttons
  BackButton: BackButton;
  MainButton: MiniButton;
  SecondaryButton: MiniButton;
  SettingsButton: SettingsButton;

  // Storage
  CloudStorage: CloudStorage;
  DeviceStorage: DeviceStorage;
  SecureStorage: SecureStorage;

  // Sensors (v8.0+)
  Accelerometer: Accelerometer;
  Gyroscope: Gyroscope;
  DeviceOrientation: DeviceOrientation;

  // Location (v8.0+)
  LocationManager: LocationManager;

  // Biometric
  BiometricManager: BiometricManager;

  // Haptic
  HapticFeedback: {
    impactOccurred(style: HapticStyle): void;
    notificationOccurred(type: HapticNotification): void;
    selectionChanged(): void;
  };

  // Dialogs
  showPopup(params: PopupParams, cb?: (buttonId: string) => void): void;
  showAlert(message: string, cb?: () => void): void;
  showConfirm(message: string, cb: (confirmed: boolean) => void): void;
  showScanQrPopup(params: ScanQrParams, cb?: (text: string) => boolean): void;
  closeScanQrPopup(): void;

  // Clipboard (v6.4+)
  readTextFromClipboard(cb: (text: string | null) => void): void;

  // Links
  openLink(url: string, params?: { try_instant_view?: boolean }): void;
  openTelegramLink(url: string): void;
  openInvoice(url: string, cb?: (status: string) => void): void;
  switchInlineQuery(query: string, types?: string[]): void;

  // Home screen (v8.0+)
  addToHomeScreen(): void;
  checkHomeScreenStatus(cb: (status: HomeScreenStatus) => void): void;

  // Share (v7.8+)
  shareToStory(mediaUrl: string, params?: { text?: string; widget_link?: { url: string; name?: string } }): void;
  shareMessage(msgId: string, cb?: (sent: boolean) => void): void;

  // Emoji status (v8.0+)
  setEmojiStatus(emoji: string, params?: { duration?: number }, cb?: (set: boolean) => void): void;

  // File download (v8.0+)
  downloadFile(params: DownloadFileParams, cb?: (ok: boolean) => void): void;

  // Contact / write access (v6.9+)
  requestContact(cb: (sent: boolean) => void): void;
  requestWriteAccess(cb: (granted: boolean) => void): void;
}

// ── Singleton access ─────────────────────────────────────────────────────────

export const twa: WebApp | null =
  (typeof window !== "undefined" ? window.Telegram?.WebApp : undefined) ?? null;

export function isTelegram(): boolean {
  return !!twa && !!twa.initData;
}

export function isVersionAtLeast(target: string): boolean {
  return twa?.isVersionAtLeast?.(target) ?? false;
}

// ── Core lifecycle ────────────────────────────────────────────────────────────

export function ready() { twa?.ready(); }
export function expand() { twa?.expand(); }
export function close() { twa?.close(); }

// ── User info ─────────────────────────────────────────────────────────────────

export function getInitData(): string { return twa?.initData ?? ""; }
export function getTelegramUser(): TelegramUser | null {
  return twa?.initDataUnsafe?.user ?? null;
}
export function getPlatform(): string { return twa?.platform ?? "browser"; }

// ── Theme ─────────────────────────────────────────────────────────────────────

export function colorScheme() { return twa?.colorScheme ?? "dark"; }
export function themeParams(): ThemeParams { return twa?.themeParams ?? {}; }

export function setHeaderColor(color: string) { twa?.setHeaderColor?.(color); }
export function setBackgroundColor(color: string) { twa?.setBackgroundColor?.(color); }
export function setBottomBarColor(color: string) { twa?.setBottomBarColor?.(color); }

// ── Viewport / safe areas ─────────────────────────────────────────────────────

export function getViewport() {
  return {
    height: twa?.viewportHeight ?? window.innerHeight,
    stableHeight: twa?.viewportStableHeight ?? window.innerHeight,
    isExpanded: twa?.isExpanded ?? false,
    isFullscreen: twa?.isFullscreen ?? false,
  };
}

export function getSafeAreaInset(): SafeAreaInset {
  return twa?.safeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
}

export function getContentSafeAreaInset(): SafeAreaInset {
  return twa?.contentSafeAreaInset ?? { top: 0, bottom: 0, left: 0, right: 0 };
}

// ── Fullscreen (v8.0+) ────────────────────────────────────────────────────────

export function requestFullscreen() {
  if (isVersionAtLeast("8.0")) twa?.requestFullscreen();
}

export function exitFullscreen() {
  if (isVersionAtLeast("8.0")) twa?.exitFullscreen();
}

export function isFullscreen(): boolean {
  return twa?.isFullscreen ?? false;
}

// ── Orientation lock (v8.0+) ──────────────────────────────────────────────────

export function lockOrientation() {
  if (isVersionAtLeast("8.0")) twa?.lockOrientation();
}

export function unlockOrientation() {
  if (isVersionAtLeast("8.0")) twa?.unlockOrientation();
}

// ── Vertical swipe control (v7.7+) ────────────────────────────────────────────

export function setVerticalSwipes(enabled: boolean) {
  if (!isVersionAtLeast("7.7")) return;
  if (enabled) twa?.enableVerticalSwipes();
  else twa?.disableVerticalSwipes();
}

// ── Closing confirmation ──────────────────────────────────────────────────────

export function setClosingConfirmation(enabled: boolean) {
  if (enabled) twa?.enableClosingConfirmation();
  else twa?.disableClosingConfirmation();
}

// ── Events ────────────────────────────────────────────────────────────────────

export function onEvent(event: WebAppEvent, handler: () => void) {
  twa?.onEvent?.(event, handler);
  return () => twa?.offEvent?.(event, handler);
}

// ── Haptic ────────────────────────────────────────────────────────────────────

export const haptic = {
  impact: (style: HapticStyle = "medium") => twa?.HapticFeedback?.impactOccurred(style),
  notification: (type: HapticNotification) => twa?.HapticFeedback?.notificationOccurred(type),
  selection: () => twa?.HapticFeedback?.selectionChanged(),
};

// ── Back button ───────────────────────────────────────────────────────────────

export function setBackButton(visible: boolean, onClick?: () => void) {
  const btn = twa?.BackButton;
  if (!btn) return () => {};
  if (onClick) btn.onClick(onClick);
  if (visible) btn.show(); else btn.hide();
  return () => { if (onClick) btn.offClick(onClick); };
}

// ── Main button ───────────────────────────────────────────────────────────────

interface MainButtonOptions {
  text: string;
  visible?: boolean;
  enabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  color?: string;
  textColor?: string;
  hasShineEffect?: boolean;
}

export function setMainButton(options: MainButtonOptions) {
  const btn = twa?.MainButton;
  if (!btn) return () => {};

  // setText throws "Bottom button text is required" on empty string
  if (options.text) btn.setText(options.text);
  btn.setParams({
    color: options.color,
    text_color: options.textColor,
    has_shine_effect: options.hasShineEffect,
    is_active: options.enabled ?? true,
    is_visible: options.visible ?? true,
  });

  if (options.enabled === false) btn.disable(); else btn.enable();
  if (options.loading) btn.showProgress(true); else btn.hideProgress();
  if (options.visible === false) btn.hide(); else btn.show();
  if (options.onClick) btn.onClick(options.onClick);

  return () => { if (options.onClick) btn.offClick(options.onClick); };
}

// ── Storage: CloudStorage (1024 keys, 4096 bytes/value) ───────────────────────

// CloudStorage was added in Telegram 6.9 — guard with version check AND try/catch
// because older simulator builds expose the object but throw on any call.
const hasCloudStorage = () => isVersionAtLeast("6.9") && !!twa?.CloudStorage?.getItem;

export async function loadPreference(key: string): Promise<string | null> {
  if (hasCloudStorage()) {
    return new Promise((resolve) => {
      try {
        twa!.CloudStorage.getItem(key, (err, value) => {
          resolve(err ? localStorage.getItem(key) : (value || localStorage.getItem(key)));
        });
      } catch {
        resolve(localStorage.getItem(key));
      }
    });
  }
  return localStorage.getItem(key);
}

export async function savePreference(key: string, value: string): Promise<void> {
  localStorage.setItem(key, value);
  if (hasCloudStorage()) {
    await new Promise<void>((resolve) => {
      try {
        twa!.CloudStorage.setItem(key, value, () => resolve());
      } catch {
        resolve();
      }
    });
  }
}

export async function removePreference(key: string): Promise<void> {
  localStorage.removeItem(key);
  if (hasCloudStorage()) {
    await new Promise<void>((resolve) => {
      try {
        twa!.CloudStorage.removeItem(key, () => resolve());
      } catch {
        resolve();
      }
    });
  }
}

// ── Storage: DeviceStorage (5MB, local device only) ───────────────────────────

export const deviceStorage = {
  async get(key: string): Promise<string | null> {
    if (isVersionAtLeast("8.0") && twa?.DeviceStorage) {
      return new Promise((resolve) => {
        twa!.DeviceStorage.getItem(key, (err, val) => resolve(err ? null : val || null));
      });
    }
    return localStorage.getItem(key);
  },

  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(key, value);
    if (isVersionAtLeast("8.0") && twa?.DeviceStorage) {
      await new Promise<void>((resolve) => {
        twa!.DeviceStorage.setItem(key, value, () => resolve());
      });
    }
  },

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
    if (isVersionAtLeast("8.0") && twa?.DeviceStorage) {
      await new Promise<void>((resolve) => {
        twa!.DeviceStorage.removeItem(key, () => resolve());
      });
    }
  },

  async keys(): Promise<string[]> {
    if (isVersionAtLeast("8.0") && twa?.DeviceStorage) {
      return new Promise((resolve) => {
        twa!.DeviceStorage.keys((err, keys) => resolve(err ? [] : keys));
      });
    }
    return Object.keys(localStorage);
  },
};

// ── Storage: SecureStorage (10 items, encrypted) ──────────────────────────────

export const secureStorage = {
  async get(key: string): Promise<string | null> {
    if (!isVersionAtLeast("8.0") || !twa?.SecureStorage) return null;
    return new Promise((resolve) => {
      twa!.SecureStorage.getItem(key, (err, val) => resolve(err ? null : val || null));
    });
  },

  async set(key: string, value: string): Promise<void> {
    if (!isVersionAtLeast("8.0") || !twa?.SecureStorage) return;
    await new Promise<void>((resolve) => {
      twa!.SecureStorage.setItem(key, value, () => resolve());
    });
  },

  async remove(key: string): Promise<void> {
    if (!isVersionAtLeast("8.0") || !twa?.SecureStorage) return;
    await new Promise<void>((resolve) => {
      twa!.SecureStorage.removeItem(key, () => resolve());
    });
  },
};

// ── Sensors: DeviceOrientation (v8.0+) ────────────────────────────────────────

export interface OrientationData {
  alpha: number; // compass (0–360)
  beta: number;  // front/back tilt (–180–180)
  gamma: number; // left/right tilt (–90–90)
}

export function startDeviceOrientation(
  onUpdate: (data: OrientationData) => void,
  refreshRate = 60,
): () => void {
  if (isVersionAtLeast("8.0") && twa?.DeviceOrientation) {
    const do_ = twa.DeviceOrientation;
    const handler = () => onUpdate({ alpha: do_.alpha, beta: do_.beta, gamma: do_.gamma });
    twa.onEvent("deviceOrientationChanged", handler);
    do_.start({ refresh_rate: refreshRate, need_absolute: false });
    return () => {
      twa!.offEvent("deviceOrientationChanged", handler);
      do_.stop();
    };
  }

  // Browser fallback
  const handler = (e: DeviceOrientationEvent) => {
    onUpdate({ alpha: e.alpha ?? 0, beta: e.beta ?? 0, gamma: e.gamma ?? 0 });
  };
  window.addEventListener("deviceorientation", handler);
  return () => window.removeEventListener("deviceorientation", handler);
}

export function startAccelerometer(
  onUpdate: (x: number, y: number, z: number) => void,
  refreshRate = 60,
): () => void {
  if (!isVersionAtLeast("8.0") || !twa?.Accelerometer) return () => {};
  const acc = twa.Accelerometer;
  const handler = () => onUpdate(acc.x, acc.y, acc.z);
  twa.onEvent("accelerometerChanged", handler);
  acc.start({ refresh_rate: refreshRate });
  return () => {
    twa!.offEvent("accelerometerChanged", handler);
    acc.stop();
  };
}

// ── Location (v8.0+) ──────────────────────────────────────────────────────────

export async function requestLocation(): Promise<LocationData | null> {
  if (!isVersionAtLeast("8.0") || !twa?.LocationManager) return null;
  const lm = twa.LocationManager;
  return new Promise((resolve) => {
    if (!lm.isInited) {
      lm.init(() => lm.getLocation((data) => resolve(data)));
    } else {
      lm.getLocation((data) => resolve(data));
    }
  });
}

// ── Biometric (v8.0+) ─────────────────────────────────────────────────────────

export async function initBiometric(): Promise<boolean> {
  if (!twa?.BiometricManager) return false;
  const bm = twa.BiometricManager;
  if (bm.isInited) return bm.isBiometricAvailable;
  return new Promise((resolve) => {
    bm.init(() => resolve(bm.isBiometricAvailable));
  });
}

export async function authenticateBiometric(reason?: string): Promise<{ ok: boolean; token?: string }> {
  if (!twa?.BiometricManager) return { ok: false };
  return new Promise((resolve) => {
    twa!.BiometricManager.authenticate({ reason }, (ok, token) => resolve({ ok, token }));
  });
}

// ── Dialogs ───────────────────────────────────────────────────────────────────

export async function showPopup(params: PopupParams): Promise<string> {
  if (twa?.showPopup) {
    return new Promise((resolve) => twa!.showPopup(params, (id) => resolve(id ?? "")));
  }
  // Browser fallback
  window.alert(params.message);
  return "";
}

export async function showAlert(message: string): Promise<void> {
  if (twa?.showAlert) {
    return new Promise((resolve) => twa!.showAlert(message, resolve));
  }
  window.alert(message);
}

export async function showConfirm(message: string): Promise<boolean> {
  if (twa?.showConfirm) {
    return new Promise((resolve) => twa!.showConfirm(message, resolve));
  }
  return window.confirm(message);
}

// ── Clipboard (v6.4+) ─────────────────────────────────────────────────────────

export async function readClipboard(): Promise<string | null> {
  if (isVersionAtLeast("6.4") && twa?.readTextFromClipboard) {
    return new Promise((resolve) => twa!.readTextFromClipboard((text) => resolve(text)));
  }
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

export async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ── Links ─────────────────────────────────────────────────────────────────────

export function openLink(url: string, instantView = false) {
  twa?.openLink?.(url, { try_instant_view: instantView });
}

export function openTelegramLink(url: string) {
  twa?.openTelegramLink?.(url);
}

// ── Home screen (v8.0+) ───────────────────────────────────────────────────────

export function addToHomeScreen() {
  if (isVersionAtLeast("8.0")) twa?.addToHomeScreen?.();
}

export async function checkHomeScreenStatus(): Promise<HomeScreenStatus> {
  if (!isVersionAtLeast("8.0") || !twa?.checkHomeScreenStatus) return "unknown";
  return new Promise((resolve) => twa!.checkHomeScreenStatus(resolve));
}

// ── Share (v7.8+) ─────────────────────────────────────────────────────────────

export function shareToStory(mediaUrl: string, text?: string) {
  if (isVersionAtLeast("7.8")) twa?.shareToStory?.(mediaUrl, { text });
}

// ── QR scanner (v6.4+) ────────────────────────────────────────────────────────

export function openQrScanner(hint?: string, onText?: (text: string) => boolean | void) {
  if (!isVersionAtLeast("6.4") || !twa?.showScanQrPopup) return;
  twa.showScanQrPopup({ text: hint }, (text) => {
    const done = onText?.(text);
    if (done) twa!.closeScanQrPopup?.();
    return !!done;
  });
}

// ── CSS theme application ─────────────────────────────────────────────────────

export function applyTelegramTheme() {
  const root = document.documentElement;
  const params = themeParams();
  const scheme = colorScheme();
  const viewport = getViewport();
  const safeArea = getSafeAreaInset();
  const contentSafeArea = getContentSafeAreaInset();

  root.dataset.tgScheme = scheme;
  root.style.setProperty("--tg-color-scheme", scheme);
  root.style.setProperty("--tg-bg-color", params.bg_color ?? (scheme === "dark" ? "#0a0a0f" : "#f5f7fb"));
  root.style.setProperty("--tg-secondary-bg-color", params.secondary_bg_color ?? (scheme === "dark" ? "#10151b" : "#ffffff"));
  root.style.setProperty("--tg-bottom-bar-bg-color", params.bottom_bar_bg_color ?? params.bg_color ?? "#0a0a0f");
  root.style.setProperty("--tg-text-color", params.text_color ?? (scheme === "dark" ? "#ffffff" : "#0f1720"));
  root.style.setProperty("--tg-hint-color", params.hint_color ?? (scheme === "dark" ? "rgba(255,255,255,0.42)" : "rgba(15,23,32,0.45)"));
  root.style.setProperty("--tg-link-color", params.link_color ?? "#4de48a");
  root.style.setProperty("--tg-button-color", params.button_color ?? "#18a558");
  root.style.setProperty("--tg-button-text-color", params.button_text_color ?? "#f6fff8");
  root.style.setProperty("--tg-accent-color", params.accent_text_color ?? "#4de48a");

  // Viewport
  root.style.setProperty("--app-viewport-height", `${viewport.height}px`);
  root.style.setProperty("--app-viewport-stable-height", `${viewport.stableHeight}px`);

  // Telegram safe areas (on top of CSS env() values)
  root.style.setProperty("--tg-safe-top", `${safeArea.top}px`);
  root.style.setProperty("--tg-safe-bottom", `${safeArea.bottom}px`);
  root.style.setProperty("--tg-safe-left", `${safeArea.left}px`);
  root.style.setProperty("--tg-safe-right", `${safeArea.right}px`);

  // Content safe area (excludes Telegram header/footer chrome)
  root.style.setProperty("--tg-content-safe-top", `${contentSafeArea.top}px`);
  root.style.setProperty("--tg-content-safe-bottom", `${contentSafeArea.bottom}px`);
  root.style.setProperty("--tg-content-safe-left", `${contentSafeArea.left}px`);
  root.style.setProperty("--tg-content-safe-right", `${contentSafeArea.right}px`);
}

// ── Global type augmentation ──────────────────────────────────────────────────

declare global {
  interface Window {
    Telegram?: { WebApp: WebApp };
  }
}
