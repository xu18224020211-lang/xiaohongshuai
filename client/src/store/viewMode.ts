import { useEffect, useState } from 'react';

/**
 * 设备识别（不再提供 PC / 手机端手动切换）：
 * 真机（窄屏 / 移动 UA）一律走移动端排版，桌面浏览器一律走 PC 排版，
 * 完全按设备自动判定，避免用户留在错误的排版里。
 */

/** 真机（窄屏 / 触摸）判定 */
export const isRealMobileDevice = (): boolean => {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const byUA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|MiuiBrowser|WeChat/i.test(ua);
  const bySize = window.matchMedia('(max-width: 767px)').matches;
  return byUA || bySize;
};

/**
 * 是否按手机排版渲染（纯自动识别，随窗口尺寸变化实时更新）。
 */
export function useIsMobileLayout(): boolean {
  const [deviceMobile, setDeviceMobile] = useState(isRealMobileDevice);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 767px)');
    const on = () => setDeviceMobile(isRealMobileDevice());
    m.addEventListener('change', on);
    window.addEventListener('resize', on);
    window.addEventListener('orientationchange', on);
    on();
    return () => {
      m.removeEventListener('change', on);
      window.removeEventListener('resize', on);
      window.removeEventListener('orientationchange', on);
    };
  }, []);
  return deviceMobile;
}
