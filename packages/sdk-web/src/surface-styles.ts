// Approved SDK surface system. These overrides retain the existing web
// presentation configuration while adapting sheets to small landscape screens.
export const surfaceStyles = `
:host{container-type:size;--ug-fill:color-mix(in srgb,var(--ug-text) 6%,var(--ug-bg));--ug-tint:color-mix(in srgb,var(--ug-primary) 10%,var(--ug-bg))}
.ug-surface{box-shadow:none;min-height:0}
.ug-chrome{display:flex;align-items:center;gap:12px;min-height:56px;padding:4px 12px;flex-shrink:0}
.ug-close,.ug-back{position:static;display:grid;place-items:center;padding:0;border:0;flex-shrink:0;width:44px;height:44px;min-width:44px;min-height:44px;border-radius:50%;color:var(--ug-text);background:transparent}
.ug-close svg,.ug-back svg{width:32px;height:32px;padding:9px;border-radius:50%;background:var(--ug-fill)}
.ug-close:hover,.ug-back:hover{background:transparent}.ug-close:hover svg,.ug-back:hover svg{background:color-mix(in srgb,var(--ug-text) 12%,var(--ug-bg))}
.feedback .ug-chrome,.survey .ug-chrome{display:grid;grid-template-columns:44px minmax(0,1fr) 44px}
.feedback .ug-chrome>.ug-close,.survey .ug-chrome>.ug-close,.ug-chrome>.ug-back{grid-column:1;grid-row:1}
.feedback .ug-chrome[data-has-back=true]>[aria-label=Close],.survey .ug-chrome[data-has-back=true]>[aria-label=Close]{grid-column:3}
.ug-chrome>.ug-progress{grid-column:2;grid-row:1;width:100%;max-width:320px;justify-self:center;margin:0}
.ug-back svg{transform:scaleX(1)}:host([dir=rtl]) .ug-back svg{transform:scaleX(-1)}
.ug-content{min-height:0;overscroll-behavior:contain;padding:12px 24px 24px}
.ug-content>*{max-width:560px;margin-left:auto;margin-right:auto}
.ug-content h2{font-size:20px;font-weight:700;line-height:1.3;letter-spacing:-.01em;margin:0 auto 16px;text-align:start}
.ug-content.ug-numeric h2{text-align:center}
.ug-content p{font-size:15px;line-height:1.5}
.ug-content img{border-radius:max(8px,calc(var(--ug-radius) - 6px));margin:0 auto 18px}
.ug-input{margin-top:12px;min-height:50px;border:1.5px solid transparent;border-radius:min(14px,var(--ug-radius));background:var(--ug-fill);padding:12px 14px;font-size:16px;line-height:1.4;scroll-margin:16px}
.ug-input:focus{border-color:var(--ug-primary);outline:none}.ug-input:focus-visible{outline:2px solid var(--ug-primary);outline-offset:2px}
textarea.ug-input{min-height:112px}.ug-input::placeholder{color:var(--ug-muted)}
.ug-option{min-height:52px;border-width:1.5px;border-radius:min(16px,var(--ug-radius));font-size:16px}
.ug-option:has(input:checked){background:var(--ug-tint)}.ug-option input{width:22px;height:22px;margin-left:auto;order:1}
.ug-scale{margin-top:16px}.ug-score{min-height:48px;font-size:16px;font-weight:700;border-width:1.5px;text-align:center}
.ug-score[aria-checked=true]{color:var(--ug-on-primary);background:var(--ug-primary)}
.ug-labels{font-size:13px}.ug-labels>*{flex:1}.ug-labels>*:last-child{text-align:end}
.ug-button{min-height:50px;padding:12px 24px;border-radius:25px;font-size:16px;font-weight:700;text-align:center;white-space:normal;overflow-wrap:anywhere;color:var(--ug-on-primary)}
.ug-button.secondary{border-width:1.5px;color:var(--ug-text);background:transparent}
button.ug-button:disabled{opacity:1;color:var(--ug-muted);background:var(--ug-fill)}
.ug-footer{min-height:0;padding:12px 24px max(16px,env(safe-area-inset-bottom));border-top:0;flex-wrap:wrap;max-height:40dvh;overflow:auto}
.ug-footer .ug-button{flex:1}.ug-footer .secondary{margin-right:0}
.feedback .ug-footer,.survey .ug-footer{width:100%;max-width:608px;align-self:center;flex-shrink:0}
.survey .ug-content{flex:1}
.ug-progress{margin:0 24px 12px;height:4px;border-radius:2px;overflow:hidden}.ug-step{font-size:13px;font-weight:600}
.ug-progress.ug-dots{display:flex;justify-content:center;gap:6px;height:6px;background:transparent}.ug-dots span{height:6px;width:6px;border-radius:50%;background:var(--ug-border)}.ug-dots span[data-active=true]{background:var(--ug-primary)}
.preview.feedback:not(.card) .ug-surface{max-height:calc(100% - 8px)}
.ug-success{padding:32px 24px}.ug-success h2{text-align:center}.ug-list-item{padding:18px 16px;border:1.5px solid var(--ug-border);border-radius:min(16px,var(--ug-radius));margin-bottom:10px}
.ug-list-item:hover{background:var(--ug-fill)}.ug-toolbar{flex-wrap:wrap}.ug-toolbar .ug-input{flex:1;min-width:140px}.ug-toolbar select{min-height:44px;max-width:100%}
.ug-link{min-height:44px;color:var(--ug-text);text-decoration:underline;text-underline-offset:3px}.ug-error{color:var(--ug-text);font-weight:500}
.ug-comment textarea{margin-bottom:12px}.ug-comment .ug-button{margin-bottom:8px}
.preview .ug-surface{max-height:calc(100% - 24px)}
@container (max-width:640px){
 .ug-root.feedback:not(.card){padding:0;align-items:flex-end}
 .feedback:not(.card) .ug-surface{width:100%;max-height:calc(100dvh - max(16px,env(safe-area-inset-top)));border-radius:var(--ug-radius) var(--ug-radius) 0 0}
 .survey .ug-chrome,.requests .ug-chrome{padding-top:max(4px,env(safe-area-inset-top))}
 .ug-content{padding:12px 24px 24px}.ug-content h2{font-size:20px}
 .ug-scale.nps{display:flex;flex-direction:column-reverse;gap:6px}.ug-scale.nps .ug-score{width:100%;text-align:center}
 .ug-scale.ten:not(.nps){grid-template-columns:repeat(5,minmax(0,1fr))}
 .inapp .ug-footer{flex-direction:column;align-items:stretch}.inapp .ug-footer .ug-button{flex:none}
}
@container (orientation:landscape) and (max-height:600px) and (max-width:960px){
 .ug-root.feedback:not(.card),.ug-root.survey{padding:0;align-items:flex-end;height:var(--ug-visible-height,100%);bottom:auto}
 .feedback:not(.card) .ug-surface,.survey .ug-surface{width:100%;max-height:calc(100% - max(8px,env(safe-area-inset-top)));display:grid;grid-template-columns:minmax(24px,1fr) 44px 8px 44px 8px minmax(0,352px) 8px 96px minmax(24px,1fr);grid-template-rows:auto minmax(0,1fr);border-radius:var(--ug-radius) var(--ug-radius) 0 0;padding-left:env(safe-area-inset-left);padding-right:env(safe-area-inset-right)}
 .feedback:not(.card) .ug-chrome,.survey .ug-chrome{display:contents}
 .feedback:not(.card) .ug-chrome>.ug-close,.survey .ug-chrome>.ug-close,.feedback:not(.card) .ug-chrome[data-has-back=true]>[aria-label=Close],.survey .ug-chrome[data-has-back=true]>[aria-label=Close]{grid-column:2;grid-row:1;align-self:center}
 .feedback:not(.card) .ug-chrome>.ug-back,.survey .ug-chrome>.ug-back{grid-column:4;grid-row:1;align-self:center}
 .feedback:not(.card) .ug-chrome>.ug-progress,.survey .ug-chrome>.ug-progress{grid-column:6;grid-row:1;max-width:320px;align-self:center}
 .feedback:not(.card) .ug-close svg,.survey .ug-close svg,.feedback:not(.card) .ug-back svg,.survey .ug-back svg{width:44px;height:44px;padding:13px}
 .feedback:not(.card) .ug-footer,.survey .ug-footer{grid-column:8;grid-row:1;width:96px;max-width:none;padding:4px 0;max-height:none;overflow:visible;align-self:center;flex-direction:column;gap:8px}
 .feedback:not(.card) .ug-footer .ug-button,.survey .ug-footer .ug-button{width:100%;flex:none;min-height:44px;padding:10px 18px;border-radius:22px;font-size:15px}
 .feedback:not(.card) .ug-content,.survey .ug-content{grid-column:1/-1;grid-row:2;padding-top:8px;padding-bottom:12px}
 .feedback:not(.card) .ug-content>.ug-step,.survey .ug-content>.ug-step{display:none}
 .ug-scale.nps{display:grid;grid-template-columns:repeat(11,minmax(0,1fr));gap:4px}
 .ug-content>*{max-width:560px}.ug-content img{max-height:128px}
 .inapp .ug-footer{flex-direction:row}.inapp .ug-footer .ug-button{flex:1}
}
@media (forced-colors:active){.ug-score[aria-checked=true],.ug-option:has(input:checked){outline:2px solid Highlight}.ug-input{border-color:CanvasText}}
`
