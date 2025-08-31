// ==UserScript==
// @name         Moonkey简历助手
// @namespace    https://github.com/Moonkey233/Resume-Helper/
// @version      1.0.0
// @description  Moonkey简历助手
// @author       Moonkey233
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @include      *
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'moonkey_resume_helper_v1';
    const VERSION = '1.0.0';

    // --- Utilities -----------------------------------------------------------------
    function loadData() {
        try {
            const data = GM_getValue(STORAGE_KEY);
            return data || { blocks: [] };
        } catch (e) {
            console.error('加载配置失败，返回空数据', e);
            return { blocks: [] };
        }
    }

    function saveData(data) {
        try {
            GM_setValue(STORAGE_KEY, data);
        } catch (e) {
            console.error('保存配置失败', e);
        }
    }

    async function copyToClipboard(text) {
        if (!text) return Promise.resolve();
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(text);
                return;
            }
        } catch (e) {
            console.warn('navigator.clipboard 写入失败，尝试回退。', e);
        }
        return fallbackCopy(text);
    }

    function fallbackCopy(text) {
        return new Promise((resolve, reject) => {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
                resolve();
            } catch (e) {
                reject(e);
            }
        });
    }

    // 检查版块名称是否唯一
    function isBlockNameUnique(name, blocks, excludeTitle = null) {
        return !blocks.some(block => {
            if (excludeTitle && block.title === excludeTitle) return false;
            return block.title === name;
        });
    }

    // 检查按钮名称在版块内是否唯一
    function isButtonNameUnique(name, buttons, excludeName = null) {
        return !buttons.some(button => {
            if (excludeName && button.name === excludeName) return false;
            return button.name === name;
        });
    }

    // --- Track last focused editable element --------------------------------------
    let lastFocusedElement = null;
    document.addEventListener('focusin', (e) => {
        const t = e.target;
        if (!t) return;
        if (isEditable(t)) lastFocusedElement = t;
    }, true);

    function isEditable(el) {
        if (!el) return false;
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return true;
        if (el.isContentEditable) return true;
        return false;
    }

    function insertTextToElement(el, text) {
        if (!el) return false;
        try {
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
                const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
                const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
                const value = el.value || '';
                const newValue = value.slice(0, start) + text + value.slice(end);
                el.value = newValue;
                const pos = start + text.length;
                try { el.setSelectionRange(pos, pos); } catch (e) { }
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
                return true;
            }
            if (el.isContentEditable) {
                const sel = window.getSelection();
                if (!sel) return false;
                if (sel.rangeCount > 0) {
                    const range = sel.getRangeAt(0);
                    range.deleteContents();
                    range.insertNode(document.createTextNode(text));
                    range.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(range);
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                } else {
                    el.innerText += text;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                }
            }
        } catch (e) {
            console.error('插入文本失败', e);
            return false;
        }
        return false;
    }

    // --- Build UI ------------------------------------------------------------------
    const style = `
    .orh-panel { position: fixed; right: 12px; bottom: 60px; width: 400px; max-height: 70vh; z-index: 2147483647; font-family: Arial, Helvetica, sans-serif; pointer-events:auto }
    .orh-card { background: #0f1724; color: #e6eef8; border-radius: 10px; box-shadow: 0 8px 24px rgba(2,6,23,0.6); overflow: hidden; pointer-events:auto }
    .orh-header { display:flex; align-items:center; gap:8px; padding:8px 10px; cursor: grab; user-select: none; }
    .orh-title { font-weight:600; font-size:14px; flex:1 }
    .orh-actions { display:flex; gap:6px }
    .orh-btn { background:#1f2a44; border-radius:6px; padding:6px 8px; font-size:13px; cursor:pointer; border: none; color:inherit; transition: none !important; }
    .orh-body { padding:8px 10px; overflow:auto; max-height: calc(70vh - 70px); }
    .orh-block { background: rgba(255,255,255,0.02); border-radius:8px; margin-bottom:8px; padding:8px; }
    .orh-block-title { display:flex; align-items:center; gap:8px; margin-bottom:6px }
    .orh-block-title input { flex:1; background:transparent; border:1px dashed rgba(255,255,255,0.06); padding:4px 6px; border-radius:6px; color:inherit }
    .orh-buttons { display:flex; flex-direction:column; gap:8px }
    .orh-button-row { display:flex; flex-direction:column; gap:6px }
    .orh-action-button { background:#233049; padding:10px 12px; border-radius:8px; cursor:pointer; border:none; font-size:14px; color:#e6eef8; width:100%; text-align:left; transition: none !important; }
    .orh-controls { display:flex; gap:6px }
    .orh-control-small { background:#1b2636; padding:6px 8px; border-radius:6px; font-size:13px; color:#cfe6ff; cursor:pointer; transition: none !important; }
    .orh-input, .orh-select, .orh-textarea { width:100%; padding:6px 8px; border-radius:6px; border:1px solid rgba(255,255,255,0.06); background:transparent; color:inherit }
    .orh-row { display:flex; gap:6px; align-items:center; margin-bottom:6px }
    .orh-mini { position: fixed; right: 16px; bottom: 16px; width:44px; height:44px; border-radius:50%; background:#0f1724; display:flex; align-items:center; justify-content:center; color:#e6eef8; box-shadow:0 6px 18px rgba(2,6,23,0.6); cursor:pointer; z-index:2147483648 }

    /* 防止按钮点击时颜色变化 */
    .orh-btn:active, .orh-action-button:active, .orh-control-small:active {
        background: inherit !important;
        transform: none !important;
        box-shadow: none !important;
    }
    `;

    const container = document.createElement('div');
    container.className = 'orh-panel';
    container.innerHTML = `
      <style>${style}</style>
      <div class="orh-card" id="orh_card">
        <div class="orh-header" id="orh_header">
          <div class="orh-title">Moonkey简历助手</div>
          <div class="orh-actions">
            <button type="button" class="orh-btn" id="orh_import">导入</button>
            <button type="button" class="orh-btn" id="orh_export">导出</button>
            <button type="button" class="orh-btn" id="orh_add_block">新增版块</button>
            <button type="button" class="orh-btn" id="orh_toggle">最小化</button>
          </div>
        </div>
        <div class="orh-body" id="orh_body"></div>
      </div>
      <div class="orh-mini" id="orh_mini" title="打开Moonkey简历助手" style="display:none">简</div>
    `;

    document.body.appendChild(container);

    const card = container.querySelector('#orh_card');
    const header = container.querySelector('#orh_header');
    const bodyEl = container.querySelector('#orh_body');
    const toggleBtn = container.querySelector('#orh_toggle');
    const addBlockBtn = container.querySelector('#orh_add_block');
    const importBtn = container.querySelector('#orh_import');
    const exportBtn = container.querySelector('#orh_export');
    const miniBtn = container.querySelector('#orh_mini');

    // Draggable
    (function makeDraggable(node, handle) {
        let isDown = false, startX = 0, startY = 0, origX = 0, origY = 0;
        handle.addEventListener('pointerdown', (e) => {
            // 检查点击的是否是控制按钮
            if (e.target.closest('.orh-actions')) {
                return;
            }

            isDown = true;
            try { handle.setPointerCapture(e.pointerId); } catch (err) { }
            startX = e.clientX; startY = e.clientY;
            const rect = node.getBoundingClientRect();
            origX = rect.left; origY = rect.top;
            node.style.position = 'fixed';
        });
        window.addEventListener('pointermove', (e) => {
            if (!isDown) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            node.style.left = (origX + dx) + 'px';
            node.style.top = (origY + dy) + 'px';
            node.style.right = 'auto';
            node.style.bottom = 'auto';
        });
        window.addEventListener('pointerup', (e) => { isDown = false; });
    })(container, header);

    // --- Render logic -------------------------------------------------------------
    let state = loadData();

    function render() {
        bodyEl.innerHTML = '';
        state.blocks.forEach(block => {
            const b = document.createElement('div');
            b.className = 'orh-block';
            b.dataset.title = block.title;

            const titleRow = document.createElement('div');
            titleRow.className = 'orh-block-title';
            const titleInput = document.createElement('input');
            titleInput.value = block.title || '未命名版块';

            // 只在失去焦点时检查和保存
            titleInput.addEventListener('blur', () => {
                const newTitle = titleInput.value.trim();
                if (!newTitle) return;

                // 检查名称是否唯一（排除自身）
                if (!isBlockNameUnique(newTitle, state.blocks, block.title)) {
                    alert('版块名称已存在，请使用不同的名称');
                    titleInput.value = block.title;
                    return;
                }

                block.title = newTitle;
                saveData(state);
                render();
            });

            const collapseBtn = document.createElement('button');
            collapseBtn.type = 'button';
            collapseBtn.className = 'orh-control-small';
            collapseBtn.textContent = block.collapsed ? '展开' : '折叠';
            collapseBtn.addEventListener('click', () => {
                block.collapsed = !block.collapsed;
                saveData(state);
                render();
            });

            const delBlockBtn = document.createElement('button');
            delBlockBtn.type = 'button';
            delBlockBtn.className = 'orh-control-small';
            delBlockBtn.textContent = '删除版块';
            delBlockBtn.addEventListener('click', () => {
                if (!confirm('删除整个版块及其所有按钮？')) return;
                state.blocks = state.blocks.filter(x => x.title !== block.title);
                saveData(state);
                render();
            });

            titleRow.appendChild(titleInput);
            titleRow.appendChild(collapseBtn);
            titleRow.appendChild(delBlockBtn);
            b.appendChild(titleRow);

            if (!block.collapsed) {
                const inner = document.createElement('div');
                const btnWrap = document.createElement('div');
                btnWrap.className = 'orh-buttons';

                (block.buttons || []).forEach(btn => {
                    const row = document.createElement('div');
                    row.className = 'orh-button-row';

                    const act = document.createElement('button');
                    act.type = 'button';
                    act.className = 'orh-action-button';
                    act.textContent = btn.name || 'unnamed';
                    act.title = (btn.type === 'text' ? '文本按钮：点击会填入输入框并复制到剪贴板' : '路径按钮：复制路径');

                    act.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        act.style.opacity = '0.8';
                    });

                    act.addEventListener('mouseup', () => {
                        act.style.opacity = '';
                    });

                    act.addEventListener('click', async (e) => {
                        e.preventDefault();
                        e.stopPropagation();

                        if (btn.type === 'text') {
                            const ok = insertTextToElement(lastFocusedElement, btn.content);
                            await copyToClipboard(btn.content || '');
                            flashTemp(act, ok ? '已填入并复制' : '已复制');
                        } else if (btn.type === 'path') {
                            await copyToClipboard(btn.content || '');
                            flashTemp(act, '路径已复制');
                        }
                    });

                    const ctlWrap = document.createElement('div');
                    ctlWrap.className = 'orh-controls';
                    const editBtn = document.createElement('button');
                    editBtn.type = 'button';
                    editBtn.className = 'orh-control-small';
                    editBtn.textContent = '编辑';

                    editBtn.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        editBtn.style.opacity = '0.8';
                    });

                    editBtn.addEventListener('mouseup', () => {
                        editBtn.style.opacity = '';
                    });

                    editBtn.addEventListener('click', () => openEditPanel(block.title, btn.name));

                    const delBtn = document.createElement('button');
                    delBtn.type = 'button';
                    delBtn.className = 'orh-control-small';
                    delBtn.textContent = '删除';

                    delBtn.addEventListener('mousedown', (e) => {
                        e.preventDefault();
                        delBtn.style.opacity = '0.8';
                    });

                    delBtn.addEventListener('mouseup', () => {
                        delBtn.style.opacity = '';
                    });

                    delBtn.addEventListener('click', () => {
                        block.buttons = (block.buttons || []).filter(x => x.name !== btn.name);
                        saveData(state);
                        render();
                    });

                    ctlWrap.appendChild(editBtn);
                    ctlWrap.appendChild(delBtn);

                    row.appendChild(act);
                    row.appendChild(ctlWrap);
                    btnWrap.appendChild(row);
                });

                inner.appendChild(btnWrap);

                const addRow = document.createElement('div');
                addRow.className = 'orh-row';
                const nameInput = document.createElement('input');
                nameInput.className = 'orh-input';
                nameInput.placeholder = '按钮名称';
                const typeSelect = document.createElement('select');
                typeSelect.className = 'orh-select';
                const optText = document.createElement('option'); optText.value = 'text'; optText.text = '文本按钮';
                const optPath = document.createElement('option'); optPath.value = 'path'; optPath.text = '路径按钮';
                typeSelect.appendChild(optText); typeSelect.appendChild(optPath);
                addRow.appendChild(nameInput); addRow.appendChild(typeSelect);
                inner.appendChild(addRow);

                const contentRow = document.createElement('div');
                contentRow.className = 'orh-row';
                const contentInput = document.createElement('textarea');
                contentInput.className = 'orh-textarea';
                contentInput.placeholder = '内容';
                contentRow.appendChild(contentInput);

                const pasteBtn = document.createElement('button');
                pasteBtn.type = 'button';
                pasteBtn.className = 'orh-control-small';
                pasteBtn.textContent = '从剪贴板粘贴';

                pasteBtn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    pasteBtn.style.opacity = '0.8';
                });

                pasteBtn.addEventListener('mouseup', () => {
                    pasteBtn.style.opacity = '';
                });

                pasteBtn.addEventListener('click', async () => {
                    try {
                        const t = await navigator.clipboard.readText();
                        contentInput.value = (contentInput.value || '') + t;
                    } catch (e) { alert('读取剪贴板失败，请手动粘贴'); }
                });

                contentRow.appendChild(pasteBtn);
                inner.appendChild(contentRow);

                const addBtnRow = document.createElement('div');
                addBtnRow.style.display = 'flex';
                addBtnRow.style.gap = '6px';
                addBtnRow.style.marginTop = '6px';

                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.className = 'orh-btn';
                addBtn.textContent = '新增按钮';

                addBtn.addEventListener('mousedown', (e) => {
                    e.preventDefault();
                    addBtn.style.opacity = '0.8';
                });

                addBtn.addEventListener('mouseup', () => {
                    addBtn.style.opacity = '';
                });

                addBtn.addEventListener('click', () => {
                    const name = nameInput.value && nameInput.value.trim();
                    const type = typeSelect.value;
                    const content = contentInput.value && contentInput.value.trim();

                    if (!name) {
                        alert('请填写按钮名称');
                        return;
                    }

                    // 检查按钮名称是否唯一
                    if (!isButtonNameUnique(name, block.buttons || [])) {
                        alert('此版块中已存在同名按钮，请使用不同的名称');
                        return;
                    }

                    if (!content) {
                        if (!confirm('您未填写内容，是否创建空内容按钮？')) return;
                    }

                    const newBtn = { type, name, content: content || '' };
                    block.buttons = block.buttons || [];
                    block.buttons.push(newBtn);
                    saveData(state);
                    nameInput.value = '';
                    contentInput.value = '';
                    render();
                });

                addBtnRow.appendChild(addBtn);
                inner.appendChild(addBtnRow);

                b.appendChild(inner);
            }

            bodyEl.appendChild(b);
        });

        if (!state.blocks || state.blocks.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'orh-hint';
            hint.style.padding = '8px';
            hint.textContent = '目前没有版块，点击 "新增版块" 创建。';
            bodyEl.appendChild(hint);
        }
    }

    function flashTemp(el, text) {
        const original = el.textContent;
        const originalBg = el.style.backgroundColor;

        el.textContent = text;
        el.style.backgroundColor = '#3a5a99';

        setTimeout(() => {
            el.textContent = original;
            el.style.backgroundColor = originalBg;
        }, 1200);
    }

    function openEditPanel(blockTitle, buttonName) {
        const block = state.blocks.find(b => b.title === blockTitle);
        if (!block) return;
        const btn = (block.buttons || []).find(x => x.name === buttonName);
        if (!btn) return;

        const modal = document.createElement('div');
        modal.style.position = 'absolute';
        modal.style.left = '12px';
        modal.style.top = '12px';
        modal.style.right = '12px';
        modal.style.background = 'rgba(2,6,23,0.95)';
        modal.style.border = '1px solid rgba(255,255,255,0.04)';
        modal.style.padding = '10px';
        modal.style.borderRadius = '8px';
        modal.style.zIndex = 2147483649;

        modal.innerHTML = `<div style="font-weight:600;margin-bottom:8px">编辑按钮</div>`;
        const nameIn = document.createElement('input');
        nameIn.className = 'orh-input';
        nameIn.value = btn.name;

        const typeIn = document.createElement('select');
        typeIn.className = 'orh-select';
        const o1 = document.createElement('option'); o1.value = 'text'; o1.text = '文本按钮';
        const o2 = document.createElement('option'); o2.value = 'path'; o2.text = '路径按钮';
        typeIn.appendChild(o1); typeIn.appendChild(o2);
        typeIn.value = btn.type;

        const cont = document.createElement('textarea');
        cont.className = 'orh-textarea';
        cont.value = btn.content || '';
        cont.placeholder = "对于路径按钮，输入类似'D:\\Downloads'的路径";

        const save = document.createElement('button');
        save.type = 'button';
        save.className = 'orh-btn';
        save.textContent = '保存';

        const can = document.createElement('button');
        can.type = 'button';
        can.className = 'orh-btn';
        can.textContent = '取消';

        [save, can].forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault();
                btn.style.opacity = '0.8';
            });

            btn.addEventListener('mouseup', () => {
                btn.style.opacity = '';
            });
        });

        save.addEventListener('click', () => {
            const newName = nameIn.value.trim() || btn.name;

            // 检查名称是否唯一（如果名称有变化）
            if (newName !== btn.name && !isButtonNameUnique(newName, block.buttons, btn.name)) {
                alert('此版块中已存在同名按钮，请使用不同的名称');
                return;
            }

            btn.name = newName;
            btn.type = typeIn.value;
            btn.content = cont.value;
            saveData(state);
            modal.remove();
            render();
        });

        can.addEventListener('click', () => modal.remove());

        modal.appendChild(nameIn);
        modal.appendChild(typeIn);
        modal.appendChild(cont);

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '8px';
        btnRow.style.marginTop = '8px';
        btnRow.appendChild(save);
        btnRow.appendChild(can);

        modal.appendChild(btnRow);
        card.appendChild(modal);
    }

    // --- Controls -----------------------------------------------------------------
    function handleAddBlock() {
        const defaultName = "新版块";
        let newName = defaultName;
        let counter = 1;

        // 确保名称唯一
        while (!isBlockNameUnique(newName, state.blocks)) {
            newName = `${defaultName}(${counter})`;
            counter++;
        }

        const newBlock = { title: newName, collapsed: false, buttons: [] };
        state.blocks.push(newBlock);
        saveData(state);
        render();
    }

    function handleToggle() {
        showMini();
    }

    function handleImport() {
        const fi = document.createElement('input');
        fi.type = 'file';
        fi.accept = 'application/json';
        fi.style.display = 'none';

        fi.addEventListener('change', (e) => {
            const f = fi.files && fi.files[0];
            if (!f) return;

            const reader = new FileReader();
            reader.onload = (evt) => {
                try {
                    const parsed = JSON.parse(evt.target.result);
                    if (!parsed || typeof parsed !== 'object') {
                        alert('导入文件内容不合法');
                        return;
                    }

                    if (Array.isArray(parsed.blocks)) {
                        let importedBlocks = 0;
                        let importedButtons = 0;

                        parsed.blocks.forEach(importBlock => {
                            // 查找现有版块中是否有同名版块
                            const existingBlock = state.blocks.find(block => block.title === importBlock.title);

                            if (existingBlock) {
                                // 存在同名版块，则遍历导入版块的按钮
                                if (Array.isArray(importBlock.buttons)) {
                                    importBlock.buttons.forEach(importButton => {
                                        // 检查按钮名称在现有版块中是否唯一
                                        if (isButtonNameUnique(importButton.name, existingBlock.buttons)) {
                                            existingBlock.buttons.push({
                                                type: importButton.type || 'text',
                                                name: importButton.name || '导入按钮',
                                                content: importButton.content || ''
                                            });
                                            importedButtons++;
                                        } else {
                                            console.log(`跳过重复按钮: ${importButton.name} (在版块 ${importBlock.title} 中)`);
                                        }
                                    });
                                }
                            } else {
                                // 不存在同名版块，则添加整个版块
                                const newBlock = {
                                    title: importBlock.title,
                                    collapsed: typeof importBlock.collapsed === 'boolean' ? importBlock.collapsed : true,
                                    buttons: []
                                };

                                if (Array.isArray(importBlock.buttons)) {
                                    importBlock.buttons.forEach(bt => {
                                        newBlock.buttons.push({
                                            type: bt.type === 'path' ? 'path' : 'text',
                                            name: bt.name || '导入按钮',
                                            content: bt.content || ''
                                        });
                                        importedButtons++;
                                    });
                                }

                                state.blocks.push(newBlock);
                                importedBlocks++;
                            }
                        });

                        saveData(state);
                        render();
                        alert(`导入成功：新增 ${importedBlocks} 个版块，新增 ${importedButtons} 个按钮（跳过重复内容）`);
                    } else {
                        alert('导入文件中没有 blocks 数组，导入无效。');
                    }
                } catch (err) {
                    console.error(err);
                    alert('导入失败：解析 JSON 出错');
                }
            };
            reader.readAsText(f);
        });

        document.body.appendChild(fi);
        fi.click();
        fi.remove();
    }

    function handleExport() {
        const exportData = {
            blocks: state.blocks.map(block => ({
                title: block.title,
                collapsed: block.collapsed,
                buttons: block.buttons.map(button => ({
                    type: button.type,
                    name: button.name,
                    content: button.content
                }))
            }))
        };

        const dataStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'moonkey_resume_helper_export_' + (new Date()).toISOString() + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    }

    [addBlockBtn, toggleBtn, importBtn, exportBtn].forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
            e.preventDefault();
            btn.style.opacity = '0.8';
        });

        btn.addEventListener('mouseup', () => {
            btn.style.opacity = '';
        });
    });

    addBlockBtn.addEventListener('click', handleAddBlock);
    toggleBtn.addEventListener('click', handleToggle);
    importBtn.addEventListener('click', handleImport);
    exportBtn.addEventListener('click', handleExport);

    function showMini() {
        card.style.display = 'none';
        miniBtn.style.display = 'flex';
    }

    function showCard() {
        card.style.display = '';
        miniBtn.style.display = 'none';
    }

    miniBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showCard();
        e.target.blur();
    });

    render();
    showMini();

    window.addEventListener('keydown', (e) => {
        if (e.shiftKey && e.code === 'KeyR') {
            if (miniBtn.style.display === 'none') showMini(); else showCard();
        }
    });

    console.log('Moonkey简历助手 已加载（Tampermonkey 脚本，v' + VERSION + '）。按 Shift+R 切换显示。');

})();