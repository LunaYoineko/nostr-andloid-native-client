import { Navigate } from "react-router";

/**
 * 設定「このアプリについて」（sections.ts の "about"）の中身（#647）。LP（/about）は常に静的 HTML の
 * #lp が描くので、ここでは即座に /about へ置き換えるだけ（SettingsScreen の SectionBody switch には
 * まだ繋いでいない。#643/#645 と同時に進行中の SettingsScreen.tsx の変更が終わってから、
 * `case "about": return <AboutSection />;` を足す想定）。
 */
export function AboutSection() {
  return <Navigate to="/about" replace />;
}
