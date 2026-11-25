// toast-icons — pick a sprite icon from the toast message itself.
//
// The toast container already draws a generic per-type icon. This adds a
// message-aware icon on top ("已复制" -> copy, "已删除" -> trash) so common
// actions are recognisable without reading the text. Returns '' when no rule
// matches, which keeps the existing type icon as the fallback.

export const TOAST_ICON_RULES = Object.freeze([
    [/失败|错误|异常|无法|出错|超时/, 'icon-alert'],
    [/请先|请选择|请填写|需要|注意|不支持|不可用/, 'icon-info'],
    [/已复制|复制成功|已拷贝/, 'icon-copy'],
    [/已导入|导入成功|导入完成/, 'icon-import'],
    [/已导出|导出成功|导出完成/, 'icon-export'],
    [/已删除|删除成功|已移除|已清空/, 'icon-delete'],
    [/已保存|保存成功|已更新|已设置|已开启|已关闭|已切换/, 'icon-check'],
    [/已生成|生成完成|已完成|完成/, 'icon-check']
]);

export const getToastIcon = (message) => {
    const text = String(message || '');
    for (const [pattern, icon] of TOAST_ICON_RULES) {
        if (pattern.test(text)) return icon;
    }
    return '';
};