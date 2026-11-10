/**
 * 面板文案（locale 命名空间 `dshOutput`）。
 *
 * `index.tsx` 在插件 apply 里 `ctx.locale.register(NS, { zh, en })`，并把
 * `ctx.locale.bind(NS)` 得到的 `t` 作为 props 传给 `OutputsPanel`。
 * key 是扁平字符串，`{name}` 会被 t 的第二个参数插值。
 */

/** locale 命名空间，与 `ctx.locale.register(NS, ...)`、slot 的 `locale` 保持一致。 */
export const NS = 'dshOutput'

/** 简体中文字典；也是 key 集合的单一真相源。 */
export const zh = {
  'panel.title': '产出物',
  'panel.refresh': '刷新列表',
  'panel.loading': '正在读取产出物…',
  'panel.countTitle': '交付文件数',
  'panel.running': '会话运行中，自动刷新',
  'panel.searchPlaceholder': '搜索文件名或路径',
  'panel.clearSearch': '清空搜索',
  'panel.emptyTitle': '这次对话还没有交付文件',
  'panel.emptyDesc': '生成报告、表格、图片或演示文稿后，会出现在这里。除显式交付外，源码、配置与临时目录不收录。',
  'panel.noMatches': '没有匹配的文件',
  'panel.noMatchesDesc': '试试别的文件名或路径关键词。',
  'panel.noKindMatches': '没有「{kind}」类型的文件',
  'panel.noKindMatchesDesc': '切换类型筛选，或清空搜索关键词后再试。',
  'panel.clearFilters': '清除筛选',
  'panel.loadError': '读取产出物失败',
  'panel.loadErrorHint': '请稍后重试；如果一直失败，可能是这个会话的日志不可读。',
  'panel.retry': '重试',
  'panel.footer': '仅显示交付类文件 · 除显式交付外，源码/配置/临时目录不收录',
  'panel.footerCount': '共 {count} 个',
  'panel.truncatedHint': '交付物过多，仅显示前 {shown} 条（共 {total} 条）',

  'filter.all': '全部',
  'filter.doc': '文档',
  'filter.sheet': '表格',
  'filter.image': '图片',
  'filter.other': '其它',

  'source.presented': '显式交付',
  'source.write': '本次对话生成',
  'source.edit': '本次对话生成',
  'source.bash': '脚本生成',
  'source.reply': '对话中提到的文件',
  'badge.source': '源码',

  'action.preview': '在右栏预览',
  'action.open': '用默认应用打开',
  'action.reveal': '在 Finder 中显示',
  'action.openError': '打开失败，请重试',
  'action.previewError': '预览打开失败，请重试',
  'action.revealError': '定位失败，请重试',
  'action.opened': '已用默认应用打开',
  'action.revealed': '已在 Finder 中显示',

  'guideDescription': '汇总当前会话交付给用户的文件，可在右栏预览、用默认应用打开或在 Finder 中定位。',
  // 兼容 index.tsx 里 guide 描述取键的写法（面板本身不用这个 key）。
  'panel.guideDescription': '汇总当前会话交付给用户的文件，可在右栏预览、用默认应用打开或在 Finder 中定位。',
  'shortcut.open': '打开产出物',
  'shortcut.noSession': '请先选择会话',

  'type.html': 'HTML',
  'type.htm': 'HTML',
  'type.md': 'Markdown',
  'type.txt': '文本',
  'type.pdf': 'PDF',
  'type.docx': 'Word',
  'type.xlsx': 'Excel',
  'type.csv': 'CSV',
  'type.pptx': 'PPT',
  'type.png': 'PNG',
  'type.jpg': 'JPG',
  'type.jpeg': 'JPEG',
  'type.webp': 'WebP',
  'type.gif': 'GIF',
  'type.svg': 'SVG',
  'type.zip': 'ZIP',
  'type.mp4': 'MP4',
  'type.mov': 'MOV',
  'type.mp3': 'MP3',
  'type.wav': 'WAV',

  'time.today': '今天 {time}',
  'time.yesterday': '昨天 {time}',
  'time.sameYear': '{month}月{day}日 {time}',
  'time.otherYear': '{year}年{month}月{day}日',
} as const

/** key 集合类型；`en` 必须与此完全一致（少一个 key 就编译不过）。 */
export type OutputsLocaleKey = keyof typeof zh

/** English dictionary, checked against the Chinese key set. */
export const en: Record<OutputsLocaleKey, string> = {
  'panel.title': 'Outputs',
  'panel.refresh': 'Refresh list',
  'panel.loading': 'Reading deliverables…',
  'panel.countTitle': 'Deliverable count',
  'panel.running': 'Conversation is running — auto-refreshing',
  'panel.searchPlaceholder': 'Search file name or path',
  'panel.clearSearch': 'Clear search',
  'panel.emptyTitle': 'No deliverables yet',
  'panel.emptyDesc': 'Reports, spreadsheets, images and presentations will show up here. Except for explicitly presented files, source, config and temporary files are excluded.',
  'panel.noMatches': 'No matching files',
  'panel.noMatchesDesc': 'Try a different file name or path keyword.',
  'panel.noKindMatches': 'No "{kind}" deliverables',
  'panel.noKindMatchesDesc': 'Switch the type filter, or clear the search to see more.',
  'panel.clearFilters': 'Clear filters',
  'panel.loadError': 'Could not read deliverables',
  'panel.loadErrorHint': 'Try again in a moment. If it keeps failing, this conversation log may be unreadable.',
  'panel.retry': 'Retry',
  'panel.footer': 'Deliverable files only · except explicitly presented files, source, config and temp folders are excluded',
  'panel.footerCount': '{count} total',
  'panel.truncatedHint': 'Too many deliverables — showing the first {shown} of {total}',

  'filter.all': 'All',
  'filter.doc': 'Docs',
  'filter.sheet': 'Sheets',
  'filter.image': 'Images',
  'filter.other': 'Other',

  'source.presented': 'Presented',
  'source.write': 'Created in chat',
  'source.edit': 'Edited in chat',
  'source.bash': 'From script',
  'source.reply': 'Mentioned in chat',
  'badge.source': 'Source',

  'action.preview': 'Preview in sidebar',
  'action.open': 'Open in default app',
  'action.reveal': 'Reveal in Finder',
  'action.openError': 'Could not open the file',
  'action.previewError': 'Could not open the preview',
  'action.revealError': 'Could not reveal the file',
  'action.opened': 'Opened in default app',
  'action.revealed': 'Revealed in Finder',

  'guideDescription': 'Files delivered in this conversation. Preview them in the sidebar, open them in the default app, or reveal them in Finder.',
  'panel.guideDescription': 'Files delivered in this conversation. Preview them in the sidebar, open them in the default app, or reveal them in Finder.',
  'shortcut.open': 'Open outputs',
  'shortcut.noSession': 'Select a conversation first',

  'type.html': 'HTML',
  'type.htm': 'HTML',
  'type.md': 'Markdown',
  'type.txt': 'Text',
  'type.pdf': 'PDF',
  'type.docx': 'Word',
  'type.xlsx': 'Excel',
  'type.csv': 'CSV',
  'type.pptx': 'PPT',
  'type.png': 'PNG',
  'type.jpg': 'JPG',
  'type.jpeg': 'JPEG',
  'type.webp': 'WebP',
  'type.gif': 'GIF',
  'type.svg': 'SVG',
  'type.zip': 'ZIP',
  'type.mp4': 'MP4',
  'type.mov': 'MOV',
  'type.mp3': 'MP3',
  'type.wav': 'WAV',

  'time.today': 'Today {time}',
  'time.yesterday': 'Yesterday {time}',
  'time.sameYear': '{month}/{day} {time}',
  'time.otherYear': '{year}/{month}/{day}',
}
