import { useEffect, useRef, useState } from "react";

/**
 * しきい値（ネイティブ RefreshableBox = Material3 PullToRefreshBox の既定
 * PullToRefreshDefaults.PositionalThreshold = 80.dp をそのまま。#601）
 */
export const PULL_TO_REFRESH_THRESHOLD = 80;

/** 離した後、スピナーを出しておく時間（ネイティブ RefreshableBox の delay(900) と同じ） */
const REFRESHING_MIN_MS = 900;

export type PullToRefreshResult = {
  /** 対象のスクロール要素に渡す ref（仮想リストなら scrollerRef、素の div なら ref） */
  ref: (el: HTMLElement | Window | null) => void;
  /** 引っ張り量（0〜1。しきい値で 1。離すと 0 に戻る） */
  progress: number;
  /** onRefresh 実行中（離した直後、一定時間はネイティブと同じくインジケータを出したままにする） */
  refreshing: boolean;
};

/**
 * タッチで、対象がスクロール上端（scrollTop === 0）のときに下へ引く操作を検知し、
 * しきい値を超えて離したら onRefresh を 1 回呼ぶ（#601）。マウス操作は見ない（タッチのみ）。
 * onRefresh を渡さなければ何もしない（ネイティブの RefreshableBox が onRefresh == null で
 * 素の Box になるのと同じ）。overscroll-behavior: none は global.css のまま変えない。
 */
export function usePullToRefresh(onRefresh: (() => void) | undefined): PullToRefreshResult {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const hasOnRefresh = onRefresh !== undefined;

  useEffect(() => {
    if (!element || !hasOnRefresh) return;
    // 指を置いた y 座標（対象がスクロール上端でなければ null = 検知しない）
    let startY: number | null = null;

    const reset = () => {
      startY = null;
      setProgress(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (element.scrollTop > 0) return;
      const touch = e.touches[0];
      if (touch) startY = touch.clientY;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (startY === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      const delta = touch.clientY - startY;
      if (delta <= 0 || element.scrollTop > 0) {
        reset();
        return;
      }
      setProgress(Math.min(1, delta / PULL_TO_REFRESH_THRESHOLD));
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (startY === null) return;
      const touch = e.changedTouches[0];
      const delta = touch ? touch.clientY - startY : 0;
      reset();
      if (delta >= PULL_TO_REFRESH_THRESHOLD) {
        setRefreshing(true);
        onRefreshRef.current?.();
      }
    };

    element.addEventListener("touchstart", onTouchStart, { passive: true });
    element.addEventListener("touchmove", onTouchMove, { passive: true });
    element.addEventListener("touchend", onTouchEnd, { passive: true });
    element.addEventListener("touchcancel", reset, { passive: true });
    return () => {
      element.removeEventListener("touchstart", onTouchStart);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("touchcancel", reset);
    };
    // 実行時の onRefresh は onRefreshRef で読むので依存には含めない（渡すたびに張り直さない）。
    // 渡す/渡さないの切り替え（hasOnRefresh）だけ見る
  }, [element, hasOnRefresh]);

  useEffect(() => {
    if (!refreshing) return;
    const timer = setTimeout(() => setRefreshing(false), REFRESHING_MIN_MS);
    return () => clearTimeout(timer);
  }, [refreshing]);

  return {
    ref: (el) => setElement(el instanceof HTMLElement ? el : null),
    progress,
    refreshing,
  };
}
