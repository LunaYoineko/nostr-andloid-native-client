/**
 * アイコン。ネイティブが使う Material Icons（Outlined, Apache-2.0）の SVG パスを必要な分だけ写す。
 * 色は currentColor、大きさは className（CSS）で決める。
 * title が無ければ装飾扱い（aria-hidden）、あれば role="img" + <title> で読み上げる。
 */
type IconProps = { className?: string; title?: string };

function Icon({ className, title, path }: IconProps & { path: string }) {
  if (title) {
    return (
      <svg className={className} viewBox="0 0 24 24" role="img">
        <title>{title}</title>
        <path d={path} fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

export function RepeatIcon(props: IconProps) {
  return <Icon {...props} path="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />;
}

export function ReplyIcon(props: IconProps) {
  return <Icon {...props} path="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z" />;
}

export function VisibilityOffIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      path="M12 6a9.77 9.77 0 0 1 8.82 5.5 9.647 9.647 0 0 1-2.41 3.12l1.41 1.41c1.39-1.23 2.49-2.77 3.18-4.53C21.27 7.11 17 4 12 4c-1.27 0-2.49.2-3.64.57l1.65 1.65C10.66 6.09 11.32 6 12 6zm-1.07 1.14L13 9.21c.57.25 1.03.71 1.28 1.28l2.07 2.07c.08-.34.14-.7.14-1.07C16.5 9.01 14.48 7 12 7c-.37 0-.72.05-1.07.14zM2.01 3.87l2.68 2.68A11.738 11.738 0 0 0 1 11.5C2.73 15.89 7 19 12 19c1.52 0 2.98-.29 4.32-.82l3.42 3.42 1.41-1.41L3.42 2.45 2.01 3.87zm7.5 7.5 2.61 2.61c-.04.01-.08.02-.12.02a2.5 2.5 0 0 1-2.5-2.5c0-.05.01-.08.01-.13zm-3.4-3.4 1.75 1.75a4.6 4.6 0 0 0-.36 1.78 4.507 4.507 0 0 0 6.27 4.14l.98.98c-.88.24-1.8.38-2.75.38a9.77 9.77 0 0 1-8.82-5.5c.7-1.43 1.72-2.61 2.93-3.53z"
    />
  );
}

export function ExpandMoreIcon(props: IconProps) {
  return <Icon {...props} path="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6-1.41-1.41z" />;
}

export function ExpandLessIcon(props: IconProps) {
  return <Icon {...props} path="m12 8-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14l-6-6z" />;
}

export function PlayCircleIcon(props: IconProps) {
  return (
    <Icon
      {...props}
      path="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2.5-3.5 7-4.5-7-4.5v9z"
    />
  );
}
