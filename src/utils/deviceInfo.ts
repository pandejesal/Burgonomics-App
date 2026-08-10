export interface DeviceInfo {
  device: string;
  browser: string;
  os: string;
}

export function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent;
  let browser = "Unknown Browser";
  let os = "Unknown OS";
  let device = "Desktop Workspace";

  // Check if running inside Capacitor native app wrapper
  if ((window as any).Capacitor && (window as any).Capacitor.isNative) {
    browser = "Capacitor WebView";
    device = "Mobile Application";
  } else if ((window as any).Capacitor) {
    browser = "Capacitor Engine";
    device = "Mobile Application";
  } else if (/Mobi|Android|iPhone|iPad/i.test(ua)) {
    device = "Mobile Browser";
  }

  if (/android/i.test(ua)) {
    os = "Android";
  } else if (/iPad|iPhone|iPod/i.test(ua)) {
    os = "iOS";
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = "macOS";
  } else if (/windows/i.test(ua)) {
    os = "Windows";
  } else if (/linux/i.test(ua)) {
    os = "Linux";
  }

  if (browser === "Unknown Browser") {
    if (/chrome|crios|crmo/i.test(ua) && !/edge|edg/i.test(ua)) {
      browser = "Chrome";
    } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
      browser = "Safari";
    } else if (/firefox|fxios/i.test(ua)) {
      browser = "Firefox";
    } else if (/edge|edg/i.test(ua)) {
      browser = "Edge";
    }
  }

  return { device, browser, os };
}
