/**
 * 「产出物」面板的样式（一整段 CSS 字符串）。
 *
 * `index.tsx` 把它注入成 `<style data-plugin-css="dsh-output/panel.css">`。
 * 约定：
 * - 颜色 / 圆角 / 阴影 / 字体只用 DSH token（`--dsw-alias-*`、`--dsw-radius-*`、`--ds-font-family-code` 等），
 *   深浅主题由 DSH 自动切换，这里不写 `[data-theme]`、不写配色常量。
 * - 全部选择器带 `dsout-` 前缀，避免和 DSH 本体 / 其它插件撞名。
 * - 面板是右栏 tab body，外框和背景由 tab body 提供；这里不画卡片、不加边框和阴影。
 * - 滚动条沿用 DSH 全局样式，不自己定义。
 */
export const PANEL_CSS = `
/* ---------- 根容器 ---------- */
.dsout-root{position:relative;display:flex;flex-direction:column;height:100%;min-height:0;min-width:0;
  color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;background:transparent;container-type:inline-size}
.dsout-root *{box-sizing:border-box}
/* reset 用 :where() 降到零特异性：单类规则（.dsout-chip / .dsout-state-action 等）才能盖住它。
 * 之前写成 .dsout-root button（0,1,1）会吃掉同名单类规则的 padding / border / font-size / color。 */
:where(.dsout-root) button{font-family:inherit;font-size:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer}
:where(.dsout-root) button:disabled{cursor:default}
.dsout-root svg{display:block;flex:none}

/* ---------- DSH 文件类型图标配色（数值取自 docs/tokens.css 的 static 色板） ---------- */
.dsout-fic{--dsout-fic-violet:rgb(139,118,246);--dsout-fic-color:var(--dsw-static-neutral-bluish-300);
  color:var(--dsout-fic-color);flex:none}
.dsout-fic-code{--dsout-fic-color:var(--dsw-static-deepseek-500)}
.dsout-fic-excel{--dsout-fic-color:var(--dsw-static-green-500)}
.dsout-fic-html{--dsout-fic-color:var(--dsw-static-deepseek-500)}
.dsout-fic-image{--dsout-fic-color:var(--dsout-fic-violet)}
.dsout-fic-markdown{--dsout-fic-color:var(--dsw-static-deepseek-500)}
.dsout-fic-other{--dsout-fic-color:var(--dsw-static-neutral-bluish-300)}
.dsout-fic-pdf{--dsout-fic-color:var(--dsw-static-red-600)}
.dsout-fic-ppt{--dsout-fic-color:var(--dsw-static-amber-500)}
.dsout-fic-video{--dsout-fic-color:var(--dsout-fic-violet)}
.dsout-fic-word{--dsout-fic-color:var(--dsw-static-deepseek-450)}

/* ---------- 面板头 38px ---------- */
.dsout-head{flex:none;display:flex;align-items:center;gap:8px;height:38px;padding:0 6px 0 16px;
  border-bottom:.5px solid var(--dsw-alias-border-l3)}
.dsout-title{flex:none;font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary)}
.dsout-count-pill{flex:none;padding:0 6px;border-radius:9px;background:var(--dsw-alias-bg-module-platform);
  color:var(--dsw-alias-label-tertiary);font-family:var(--ds-font-family-code);font-size:11px;line-height:16px;
  font-variant-numeric:tabular-nums}
.dsout-run-dot{flex:none;width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-state-business-primary)}
.dsout-head-actions{flex:none;margin-left:auto;display:flex;align-items:center;gap:2px}
.dsout-iconbtn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:none;
  border-radius:var(--dsw-radius-sm);color:var(--dsw-alias-label-secondary)}
.dsout-iconbtn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsout-iconbtn:disabled{opacity:.45}
.dsout-iconbtn svg{width:15px;height:15px}

/* ---------- 类型筛选：一条描边分段槽，只渲染有内容的类型（0 计数在 panel.tsx 里被过滤掉） ----------
 * 圆角 10px / 6px 是同心圆角（外层 = 内层 + 4px 内边距），token 圆角档位里没有这一档，故用 px。
 * 槽本身不填底色：选中项用 --dsw-alias-bg-module-platform 提亮，深浅两套主题下都是「选中更亮」。 */
.dsout-filters{flex:none;display:flex;align-items:center;gap:6px;margin:12px 12px 0;padding:4px;
  width:fit-content;max-width:calc(100% - 24px);border-radius:10px;
  border:.5px solid var(--dsw-alias-border-l3);overflow-x:auto;scrollbar-width:none}
.dsout-filters::-webkit-scrollbar{display:none}
.dsout-chip{display:inline-flex;align-items:center;gap:7px;flex:none;height:26px;padding:0 11px;
  border-radius:6px;border:.5px solid transparent;color:var(--dsw-alias-label-secondary);
  font-size:12px;line-height:16px;letter-spacing:.3px;white-space:nowrap}
.dsout-chip:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsout-chip[aria-pressed="true"]{background:var(--dsw-alias-bg-module-platform);
  border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);
  font-weight:500;box-shadow:var(--dsw-shadow-lv1)}
.dsout-chip-n{font-family:var(--ds-font-family-code);font-size:10px;line-height:14px;letter-spacing:0;
  color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums}
.dsout-chip[aria-pressed="true"] .dsout-chip-n{color:var(--dsw-alias-label-secondary)}
/* 五种类型全出现时计数自动退场：五段带计数在 360px 面板下会超出槽宽，
 * 而滚动条是隐藏的，最后一段会被圆角切掉且鼠标滚不到。 */
.dsout-filters:has(> .dsout-chip:nth-child(5)) .dsout-chip{gap:0}
.dsout-filters:has(> .dsout-chip:nth-child(5)) .dsout-chip-n{display:none}

/* ---------- 搜索 ---------- */
.dsout-searchrow{flex:none;padding:12px 12px 8px}
.dsout-searchbox{position:relative;display:flex;align-items:center}
.dsout-searchbox>svg{position:absolute;left:8px;width:13px;height:13px;color:var(--dsw-alias-label-tertiary);pointer-events:none}
.dsout-search{width:100%;height:26px;padding:0 26px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-primary);font-family:inherit;
  font-size:12px;line-height:20px;outline:none;transition:border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out),
  box-shadow var(--ds-transition-duration-fast) var(--ds-ease-in-out)}
.dsout-search::placeholder{color:var(--dsw-alias-label-tertiary)}
.dsout-search:hover{border-color:var(--dsw-alias-border-l3)}
.dsout-search:focus-visible{border-color:var(--dsw-alias-border-l4);box-shadow:0 0 0 2px var(--dsw-alias-border-l2)}
.dsout-search-clear{position:absolute;right:4px;display:inline-flex;align-items:center;justify-content:center;
  width:18px;height:18px;border-radius:4px;color:var(--dsw-alias-label-tertiary)}
.dsout-search-clear:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.dsout-search-clear svg{width:11px;height:11px}

/* ---------- 列表与行（四行制，hover 只换底色） ---------- */
.dsout-list{flex:1;min-height:0;overflow:auto;padding:2px 8px 8px}
.dsout-row{position:relative;display:flex;align-items:flex-start;gap:10px;width:100%;padding:7px 8px;
  border-radius:var(--dsw-radius-md);text-align:left;cursor:pointer;background:transparent;
  color:inherit;font:inherit}
.dsout-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsout-row:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}
.dsout-row-icon{flex:none;display:flex;margin-top:1px}
.dsout-row-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.dsout-row-name{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsout-row-path{font-family:var(--ds-font-family-code);font-size:11px;line-height:16px;
  color:var(--dsw-alias-label-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsout-row-desc{font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dsout-row-meta{display:flex;align-items:center;gap:5px;min-width:0;overflow:hidden;font-family:var(--ds-font-family-code);
  font-size:10px;line-height:14px;color:var(--dsw-alias-label-caption);white-space:nowrap}
.dsout-row-meta>*{flex:none}
.dsout-sep{color:var(--dsw-alias-border-l4)}
.dsout-meta-type{display:inline-flex;align-items:center;gap:5px;min-width:0;overflow:hidden}
.dsout-meta-time{overflow:hidden;text-overflow:ellipsis}

/* 来源徽标：presented 用 business 蓝，源码用 warn 色 */
.dsout-badge{flex:none;display:inline-flex;align-items:center;height:15px;padding:0 4px;border-radius:4px;
  background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:9px;line-height:14px;
  font-family:var(--dsw-font-family,inherit)}
.dsout-badge-explicit{background:color-mix(in srgb,var(--dsw-alias-state-business-primary) 12%,transparent);
  color:var(--dsw-alias-state-business-primary)}
.dsout-badge-source{background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 12%,transparent);
  color:var(--dsw-alias-state-warn-label)}

/* 行内动作：默认隐藏，hover / 键盘聚焦时出现 */
.dsout-row-actions{flex:none;display:flex;align-items:center;gap:2px;margin-top:2px;opacity:0;
  transition:opacity var(--ds-transition-duration-fast) var(--ds-ease-in-out)}
.dsout-row:hover .dsout-row-actions,.dsout-row:focus-within .dsout-row-actions{opacity:1}
.dsout-mini{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;flex:none;
  border-radius:999px;color:var(--dsw-alias-label-tertiary)}
.dsout-mini:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}
.dsout-mini svg{width:14px;height:14px}
@media (hover:none){
  .dsout-row-actions{opacity:1}
}

/* ---------- 空态 / 错误态 / 加载态（照原型的 .empty） ---------- */
.dsout-state{flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:10px;padding:32px 24px;text-align:center}
.dsout-state-icon{color:var(--dsw-alias-label-caption);opacity:.9}
.dsout-state-icon-error{color:var(--dsw-alias-state-error-primary);opacity:.9}
.dsout-state-title{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-secondary)}
.dsout-state-desc{font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary);max-width:250px}
.dsout-state-action{height:26px;padding:0 12px;border-radius:8px;border:.5px solid var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-secondary);font-size:12px;line-height:20px}
.dsout-state-action:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsout-spinner{width:14px;height:14px;flex:none;border-radius:999px;border:1.5px solid var(--dsw-alias-border-l3);
  border-top-color:var(--dsw-alias-state-business-primary);animation:dsout-spin .8s linear infinite}
@keyframes dsout-spin{to{transform:rotate(360deg)}}

/* ---------- 底注 ---------- */
.dsout-foot{flex:none;display:flex;align-items:center;gap:6px;padding:8px 16px 10px;
  border-top:.5px solid var(--dsw-alias-border-l1);font-size:10px;line-height:14px;color:var(--dsw-alias-label-caption)}
.dsout-foot>svg{width:11px;height:11px;color:var(--dsw-alias-label-caption)}
.dsout-foot-text{flex:1;min-width:0}
.dsout-foot-count{flex:none;font-family:var(--ds-font-family-code);font-variant-numeric:tabular-nums}

/* ---------- 面板内提示胶囊 ---------- */
.dsout-toast{position:absolute;left:50%;bottom:44px;z-index:10;display:flex;align-items:center;gap:6px;
  max-width:calc(100% - 24px);padding:6px 12px;border-radius:999px;background:var(--dsw-alias-toast-bg);
  color:var(--dsw-alias-toast-label);font-size:12px;line-height:18px;box-shadow:var(--dsw-shadow-lv2);
  pointer-events:none;white-space:nowrap;transform:translate(-50%,0);
  animation:dsout-toast-in 120ms var(--ds-ease-in-out)}
@keyframes dsout-toast-in{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
@media (prefers-reduced-motion:reduce){
  .dsout-spinner{animation:none}
  .dsout-toast{animation:none}
}

/* ---------- 窄面板（320px 起）：先去掉类型文字，靠图标/大小/时间表达 ---------- */
@container (max-width:340px){
  .dsout-meta-type{display:none}
  .dsout-row-name{font-size:12px}
  /* 窄面板优先保住类型标签本身：计数退场，避免 5 段时横向滚动把最后一段切掉 */
  .dsout-chip{padding:0 8px;gap:0}
  .dsout-chip-n{display:none}
}
`
