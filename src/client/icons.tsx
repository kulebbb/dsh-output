/**
 * 面板用到的全部 inline SVG 图标。
 *
 * - `FileTypeIcon`：DSH 文件类型图标（28×28 实心页面 + 折角 + 白色符号），路径逐字取自
 *   DSH web 打包产物，见 `prototype/icons.js` / `docs/research-tokens.md` §5。
 * - 其余是 16×16 线性小图标（搜索、关闭、刷新、信息、打开、定位），取自阶段 1 原型。
 *
 * 颜色全部走 CSS 类（`dsout-fic-*`）与 `currentColor`，主题由 DSH 的 token 自动切换。
 */
import { SOURCE_EXTS } from '../shared/types.ts'

/** DSH 文件类型名，对应打包产物里的 `.fic-*` 分类。 */
export type DshFileType =
  | 'html'
  | 'markdown'
  | 'word'
  | 'excel'
  | 'ppt'
  | 'pdf'
  | 'image'
  | 'video'
  | 'code'
  | 'other'

export interface FileTypeIconProps {
  type: DshFileType
  /** 边长（px）：列表行 16，空态 28。 */
  size?: number
}

export interface GlyphIconProps {
  /** 边长（px），默认 16。 */
  size?: number
}
/** 28×28 实心页面主体（DSH FileTypeIcon 逐字路径）。 */
const ICON_BODY = 'M8.48924 28H19.5108C21.6479 28 22.7165 28 23.5594 27.6509C24.6833 27.1853 25.5762 26.2924 26.0417 25.1685C26.3909 24.3256 26.3909 23.257 26.3909 21.1199V8.79443C26.3909 8.32877 26.3909 8.09593 26.3471 7.87507C26.2887 7.58058 26.173 7.30042 26.0067 7.05048C25.882 6.86303 25.7177 6.69799 25.3893 6.36792L20.0611 1.01354C19.7304 0.681235 19.5651 0.515081 19.3769 0.38885C19.126 0.220541 18.8443 0.103463 18.5481 0.0443412C18.3259 0 18.0915 0 17.6226 0H8.48924C6.35209 0 5.28351 0 4.4406 0.349145C3.31672 0.814671 2.4238 1.70759 1.95828 2.83147C1.60913 3.67438 1.60913 4.74296 1.60913 6.88011V21.1199C1.60913 23.257 1.60913 24.3256 1.95828 25.1685C2.4238 26.2924 3.31672 27.1853 4.4406 27.6509C5.28351 28 6.35209 28 8.48924 28Z'

/** 页面右上折角。 */
const ICON_FOLD = 'M26.3909 7.37445L19.0525 0V3.77445C19.0525 4.89271 19.0525 5.45184 19.2352 5.89289C19.4788 6.48096 19.946 6.94818 20.5341 7.19176C20.9751 7.37445 21.5342 7.37445 22.6525 7.37445H26.3909Z'

interface IconPathSpec {
  d: string
  fill?: 'currentColor' | 'none'
  stroke?: 'currentColor'
  strokeWidth?: number
  fillRule?: 'evenodd'
  clipRule?: 'evenodd'
}

interface IconMark {
  /** 白色符号的缩放/居中变换；空串表示不需要。 */
  transform: string
  paths: readonly IconPathSpec[]
}

const MARK_BY_TYPE: Record<Exclude<DshFileType, 'other'>, IconMark> = {
  html: {
    transform: 'translate(14 16) scale(1.12) translate(-14 -16)',
    paths: [
      { d: 'M13.9994 9.68298C17.212 9.68298 19.8167 12.2872 19.8168 15.4997C19.8168 18.7123 17.2121 21.3171 13.9994 21.3171C10.7869 21.3169 8.18274 18.7122 8.18274 15.4997C8.1829 12.2873 10.787 9.68315 13.9994 9.68298ZM9.26213 16.0247C9.47025 17.9241 10.7936 19.4876 12.5639 20.0463C12.42 19.7977 12.2952 19.5152 12.1879 19.2116C11.885 18.3541 11.693 17.2434 11.6424 16.0247H9.26213ZM16.3565 16.0247C16.3059 17.2434 16.1145 18.3542 15.8116 19.2116C15.7044 19.5151 15.5788 19.7971 15.435 20.0456C17.2054 19.487 18.5293 17.9242 18.7374 16.0247H16.3565ZM12.6938 16.0247C12.7439 17.1459 12.9212 18.1334 13.1784 18.8616C13.332 19.2962 13.503 19.61 13.6686 19.805C13.834 19.9996 13.9473 20.0256 13.9994 20.0258C14.0514 20.0258 14.1651 20.0002 14.331 19.805C14.4966 19.61 14.6676 19.2962 14.8211 18.8616C15.0784 18.1334 15.2557 17.1459 15.3058 16.0247H12.6938ZM13.9994 10.733C13.9473 10.7331 13.834 10.7598 13.6686 10.9545C13.503 11.1494 13.3319 11.4633 13.1784 11.8978C12.903 12.6777 12.7188 13.7545 12.6849 14.9747H15.3147C15.2808 13.7545 15.0966 12.6777 14.8211 11.8978C14.6676 11.4633 14.4965 11.1494 14.331 10.9545C14.1651 10.7593 14.0514 10.733 13.9994 10.733ZM15.5888 11.0051C15.6701 11.1756 15.7444 11.3576 15.8116 11.5478C16.1343 12.4613 16.3308 13.6619 16.3647 14.9747H18.7374C18.5352 13.1307 17.2817 11.6036 15.5888 11.0051ZM12.4101 11.0051C10.7174 11.6037 9.46428 13.1308 9.26213 14.9747H11.6349C11.6688 13.6619 11.8652 12.4613 12.1879 11.5478C12.2551 11.3577 12.3288 11.1756 12.4101 11.0051Z', fill: 'currentColor', fillRule: 'evenodd', clipRule: 'evenodd' },
    ],
  },
  markdown: {
    transform: 'translate(14 16) scale(1.22) translate(-14 -16)',
    paths: [
      { d: 'M8.7588 19.5V14.6H9.8998L11.9298 17.932H11.3278L13.3018 14.6H14.4428L14.4568 19.5H13.1828L13.1688 16.539H13.3858L11.9088 19.017H11.2928L9.7738 16.539H10.0398V19.5H8.7588ZM15.4375 19.5V14.6H17.7545C18.2958 14.6 18.7718 14.7003 19.1825 14.901C19.5932 15.1017 19.9128 15.384 20.1415 15.748C20.3748 16.112 20.4915 16.546 20.4915 17.05C20.4915 17.5493 20.3748 17.9833 20.1415 18.352C19.9128 18.716 19.5932 18.9983 19.1825 19.199C18.7718 19.3997 18.2958 19.5 17.7545 19.5H15.4375ZM16.8235 18.394H17.6985C17.9785 18.394 18.2212 18.3427 18.4265 18.24C18.6365 18.1327 18.7998 17.9787 18.9165 17.778C19.0332 17.5727 19.0915 17.33 19.0915 17.05C19.0915 16.7653 19.0332 16.5227 18.9165 16.322C18.7998 16.1213 18.6365 15.9697 18.4265 15.867C18.2212 15.7597 17.9785 15.706 17.6985 15.706H16.8235V18.394Z', fill: 'currentColor' },
    ],
  },
  word: {
    transform: 'translate(14 16) scale(1.22) translate(-14 -16)',
    paths: [
      { d: 'M10.5118 20.5L8.24179 13.5H10.2818L12.1918 19.56H11.1618L13.1718 13.5H14.9918L16.8918 19.56H15.9018L17.8718 13.5H19.7618L17.4918 20.5H15.3718L13.7518 15.35H14.3218L12.6318 20.5H10.5118Z', fill: 'currentColor' },
    ],
  },
  excel: {
    transform: '',
    paths: [
      { d: 'M14 11.5H11.4C10.5599 11.5 10.1399 11.5 9.81901 11.6635C9.53677 11.8073 9.3073 12.0368 9.16349 12.319C9 12.6399 9 13.0599 9 13.9V16.5M14 11.5H16.6C17.4401 11.5 17.8601 11.5 18.181 11.6635C18.4632 11.8073 18.6927 12.0368 18.8365 12.319C19 12.6399 19 13.0599 19 13.9V16.5M14 11.5V21.5M14 21.5H16.6C17.4401 21.5 17.8601 21.5 18.181 21.3365C18.4632 21.1927 18.6927 20.9632 18.8365 20.681C19 20.3601 19 19.9401 19 19.1V16.5M14 21.5H11.4C10.5599 21.5 10.1399 21.5 9.81901 21.3365C9.53677 21.1927 9.3073 20.9632 9.16349 20.681C9 20.3601 9 19.9401 9 19.1V16.5M19 16.5H9', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2 },
    ],
  },
  ppt: {
    transform: 'translate(14 16) scale(1.22) translate(-14 -16)',
    paths: [
      { d: 'M11.0132 20.5V13.5H14.2132C14.8532 13.5 15.4032 13.6033 15.8632 13.81C16.3299 14.0167 16.6899 14.3167 16.9432 14.71C17.1966 15.0967 17.3232 15.5567 17.3232 16.09C17.3232 16.6167 17.1966 17.0733 16.9432 17.46C16.6899 17.8467 16.3299 18.1467 15.8632 18.36C15.4032 18.5667 14.8532 18.67 14.2132 18.67H12.1132L12.9932 17.81V20.5H11.0132ZM12.9932 18.02L12.1132 17.11H14.0932C14.5066 17.11 14.8132 17.02 15.0132 16.84C15.2199 16.66 15.3232 16.41 15.3232 16.09C15.3232 15.7633 15.2199 15.51 15.0132 15.33C14.8132 15.15 14.5066 15.06 14.0932 15.06H12.1132L12.9932 14.15V18.02Z', fill: 'currentColor' },
    ],
  },
  pdf: {
    transform: 'translate(14 16) scale(1.22) translate(-14 -16)',
    paths: [
      { d: 'M6.80616 19.5V14.6H9.04616C9.49416 14.6 9.87916 14.6723 10.2012 14.817C10.5278 14.9617 10.7798 15.1717 10.9572 15.447C11.1345 15.7177 11.2232 16.0397 11.2232 16.413C11.2232 16.7817 11.1345 17.1013 10.9572 17.372C10.7798 17.6427 10.5278 17.8527 10.2012 18.002C9.87916 18.1467 9.49416 18.219 9.04616 18.219H7.57616L8.19216 17.617V19.5H6.80616ZM8.19216 17.764L7.57616 17.127H8.96216C9.2515 17.127 9.46616 17.064 9.60616 16.938C9.75083 16.812 9.82316 16.637 9.82316 16.413C9.82316 16.1843 9.75083 16.007 9.60616 15.881C9.46616 15.755 9.2515 15.692 8.96216 15.692H7.57616L8.19216 15.055V17.764ZM11.8989 19.5V14.6H14.2159C14.7573 14.6 15.2333 14.7003 15.6439 14.901C16.0546 15.1017 16.3743 15.384 16.6029 15.748C16.8363 16.112 16.9529 16.546 16.9529 17.05C16.9529 17.5493 16.8363 17.9833 16.6029 18.352C16.3743 18.716 16.0546 18.9983 15.6439 19.199C15.2333 19.3997 14.7573 19.5 14.2159 19.5H11.8989ZM13.2849 18.394H14.1599C14.4399 18.394 14.6826 18.3427 14.8879 18.24C15.0979 18.1327 15.2613 17.9787 15.3779 17.778C15.4946 17.5727 15.5529 17.33 15.5529 17.05C15.5529 16.7653 15.4946 16.5227 15.3779 16.322C15.2613 16.1213 15.0979 15.9697 14.8879 15.867C14.6826 15.7597 14.4399 15.706 14.1599 15.706H13.2849V18.394ZM17.6821 19.5V14.6H21.5251V15.671H19.0681V19.5H17.6821ZM18.9701 17.82V16.749H21.2311V17.82H18.9701Z', fill: 'currentColor' },
    ],
  },
  image: {
    transform: 'translate(14 16) scale(1.12) translate(-14 -16)',
    paths: [
      { d: 'M10.4212 15.9204C10.5756 15.6558 10.9579 15.6558 11.1123 15.9204L13.6493 20.2696C13.8048 20.5362 13.6125 20.8711 13.3037 20.8711H8.22974C7.92102 20.8711 7.72868 20.5362 7.88423 20.2696L10.4212 15.9204Z', fill: 'currentColor' },
      { d: 'M15.4981 13.186C15.6505 12.9117 16.0451 12.9117 16.1975 13.186L20.1368 20.2769C20.2849 20.5435 20.0922 20.8711 19.7872 20.8711H11.9084C11.6034 20.8711 11.4107 20.5435 11.5588 20.2769L15.4981 13.186Z', fill: 'currentColor' },
      { d: 'M11.8603 11.3997C11.8603 12.286 11.1418 13.0045 10.2555 13.0045C9.36924 13.0045 8.65076 12.286 8.65076 11.3997C8.65076 10.5134 9.36924 9.79492 10.2555 9.79492C11.1418 9.79492 11.8603 10.5134 11.8603 11.3997Z', fill: 'currentColor' },
    ],
  },
  video: {
    transform: 'translate(14 16) scale(1.12) translate(-14 -16)',
    paths: [
      { d: 'M17.5 14.634C18.1667 15.0189 18.1667 15.9811 17.5 16.366L11.5 19.8301C10.8333 20.215 10 19.7339 10 18.9641L10 12.0359C10 11.2661 10.8333 10.785 11.5 11.1699L17.5 14.634Z', fill: 'currentColor' },
    ],
  },
  code: {
    transform: '',
    paths: [
      { d: 'M10.0053 13.126L7.0236 16.3788C6.96052 16.4476 6.96052 16.5532 7.0236 16.622L10.0053 19.8748', stroke: 'currentColor', strokeWidth: 1.35 },
      { d: 'M17.9941 13.126L20.9759 16.3788C21.039 16.4476 21.039 16.5532 20.9759 16.622L17.9941 19.8748', stroke: 'currentColor', strokeWidth: 1.35 },
      { d: 'M15.2652 12.957L12.7344 20.0433', stroke: 'currentColor', strokeWidth: 1.35 },
    ],
  },
}

/** 交付白名单扩展名 → DSH 图标类型；白名单外的源码类文件走 `code`。 */
const ICON_TYPE_BY_EXT: Readonly<Record<string, DshFileType>> = {
  html: 'html',
  htm: 'html',
  md: 'markdown',
  docx: 'word',
  xlsx: 'excel',
  csv: 'excel',
  pptx: 'ppt',
  pdf: 'pdf',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  webp: 'image',
  gif: 'image',
  svg: 'image',
  mp4: 'video',
  mov: 'video',
  zip: 'other',
  mp3: 'other',
  wav: 'other',
  txt: 'other',
}

/** 扩展名（小写、不含点）→ 图标类型。 */
export function fileTypeFromExt(ext: string): DshFileType {
  const normalized = ext.toLowerCase()
  return ICON_TYPE_BY_EXT[normalized] ?? (SOURCE_EXTS.includes(normalized) ? 'code' : 'other')
}

/** DSH 文件类型图标：实心页面 + 折角 + 白色符号。 */
export function FileTypeIcon({ type, size = 16 }: FileTypeIconProps) {
  const mark = type === 'other' ? undefined : MARK_BY_TYPE[type]
  return (
    <svg
      className={'dsout-fic dsout-fic-' + type}
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
    >
      <path d={ICON_BODY} fill="currentColor" />
      <path
        d={ICON_FOLD}
        fill={type === 'other' ? 'var(--dsw-static-neutral-400)' : 'var(--dsw-static-neutral-00)'}
        fillOpacity={type === 'other' ? undefined : 0.7}
      />
      {mark ? (
        <g color="var(--dsw-static-neutral-00)" transform={mark.transform || undefined}>
          {mark.paths.map((path, index) => (
            <path
              key={index}
              d={path.d}
              fill={path.fill}
              stroke={path.stroke}
              strokeWidth={path.strokeWidth}
              fillRule={path.fillRule}
              clipRule={path.clipRule}
            />
          ))}
        </g>
      ) : null}
    </svg>
  )
}

export function SearchIcon({ size = 16 }: GlyphIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" aria-hidden="true">
      <circle cx="7.1" cy="7.1" r="4.1" />
      <path d="m10.2 10.2 2.6 2.6" />
    </svg>
  )
}

export function CloseIcon({ size = 16 }: GlyphIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" aria-hidden="true">
      <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />
    </svg>
  )
}

export function RefreshIcon({ size = 16 }: GlyphIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 8a5 5 0 1 1-1.46-3.54" />
      <path d="M13 2.7v2.9H10.1" />
    </svg>
  )
}

export function InfoIcon({ size = 16 }: GlyphIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 7.4v3.4M8 5.2v.1" />
    </svg>
  )
}

export function AlertIcon({ size = 16 }: GlyphIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" aria-hidden="true">
      <circle cx="8" cy="8" r="5.8" />
      <path d="M8 4.9v3.6M8 11.2v.1" />
    </svg>
  )
}

export function OpenIcon({ size = 16 }: GlyphIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.4 2.8h3.8v3.8" />
      <path d="M13.2 2.8 7.6 8.4" />
      <path d="M12 9.4v2.7a1 1 0 0 1-1 1H3.8a1 1 0 0 1-1-1V4.8a1 1 0 0 1 1-1h2.8" />
    </svg>
  )
}

export function RevealIcon({ size = 16 }: GlyphIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 4.9a1 1 0 0 1 1-1h3.1l1.2 1.4H13a1 1 0 0 1 1 1v5.2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" />
      <path d="M6.2 9.5h3.6M8 7.9v3.2" />
    </svg>
  )
}
