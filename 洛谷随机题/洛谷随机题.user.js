// ==UserScript==
// @name         洛谷随机题
// @namespace    https://www.luogu.com.cn
// @version      1.2
// @description  解析洛谷题库 HTML，比较相邻页判断最大页，过滤 AC，支持拉黑、拖拽、缩放、字号调整，vibe coding
// @author       thedyingkai
// @match        https://www.luogu.com.cn/*
// @grant        GM_addStyle
// @run-at       document-end
// @downloadURL  https://github.com/thedyingkai/tampermonkey/blob/main/%E6%B4%9B%E8%B0%B7%E9%9A%8F%E6%9C%BA%E9%A2%98/%E6%B4%9B%E8%B0%B7%E9%9A%8F%E6%9C%BA%E9%A2%98.user.js
// @updateURL    https://raw.githubusercontent.com/thedyingkai/tampermonkey/blob/main/%E6%B4%9B%E8%B0%B7%E9%9A%8F%E6%9C%BA%E9%A2%98/%E6%B4%9B%E8%B0%B7%E9%9A%8F%E6%9C%BA%E9%A2%98.user.js
// ==/UserScript==

(function () {
    'use strict';

    var BASE = 'https://www.luogu.com.cn';

    var STORAGE_DIFF = 'luogu_rand_diff_v1.2';
    var STORAGE_PAGE_CACHE = 'luogu_rand_page_cache_v1.2';
    var STORAGE_BLACKLIST = 'luogu_rand_blacklist_v1.2';
    var STORAGE_ALLOW_AC = 'luogu_rand_allow_ac_v1.2';
    var STORAGE_UI = 'luogu_rand_ui_v1.2';

    var CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
    var MAX_REASONABLE_PAGE = 1000;
    var MAX_RANDOM_ATTEMPT = 40;

    var COLOR = [
        'rgb(191,191,191)',
        'rgb(254,76,97)',
        'rgb(243,156,17)',
        'rgb(255,193,22)',
        'rgb(82,196,26)',
        'rgb(52,152,219)',
        'rgb(157,61,207)',
        'rgb(14,29,105)'
    ];

    var difficulties = [
        ['1', '入门'],
        ['2', '普及−'],
        ['3', '普及/提高−'],
        ['4', '普及+/提高'],
        ['5', '提高+/省选−'],
        ['6', '省选/NOI−'],
        ['7', 'NOI/NOI+/CTSC']
    ];

    GM_addStyle([
        '#luogu-rand-box{position:fixed;right:20px;bottom:20px;z-index:999999;width:350px;min-width:280px;min-height:250px;max-width:720px;max-height:86vh;background:rgba(255,255,255,.96);border:1px solid rgba(0,0,0,.08);border-radius:16px;box-shadow:0 12px 36px rgba(0,0,0,.18);padding:14px;font-family:"Microsoft YaHei",-apple-system,BlinkMacSystemFont,sans-serif;color:#222;overflow:auto;resize:both;font-size:var(--luogu-rand-font-size,14px);backdrop-filter:blur(10px)}',
        '#luogu-rand-box *{box-sizing:border-box}',
        '#luogu-rand-header{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;cursor:move;user-select:none}',
        '#luogu-rand-title{font-size:1.25em;font-weight:800;line-height:1.2}',
        '#luogu-rand-font-tools{display:flex;gap:6px;flex-shrink:0}',
        '.luogu-rand-mini-btn{width:30px;height:28px;border:none;border-radius:9px;background:#f2f3f5;color:#333;font-size:.9em;font-weight:800;cursor:pointer}',
        '.luogu-rand-mini-btn:hover{background:#e4e6eb}',
        '#luogu-rand-diff-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-bottom:10px}',
        '.luogu-rand-diff-btn{min-height:34px;border-radius:10px;border:1px solid rgba(0,0,0,.08);background:#f8f9fb;font-weight:800;cursor:pointer;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;padding:0 8px;transition:transform .12s ease,box-shadow .12s ease,background .12s ease}',
        '.luogu-rand-diff-btn:hover{transform:translateY(-1px);box-shadow:0 4px 12px rgba(0,0,0,.10)}',
        '.luogu-rand-diff-btn.active{color:#fff!important;box-shadow:0 6px 16px rgba(0,0,0,.18)}',
        '#luogu-rand-option-row{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:8px 0 10px;padding:8px 10px;border-radius:12px;background:#f7f8fa}',
        '#luogu-rand-option-row label{font-size:.95em;font-weight:650;cursor:pointer;user-select:none}',
        '#luogu-rand-allow-ac{width:42px;height:22px;appearance:none;border-radius:999px;background:#c9ced6;position:relative;cursor:pointer;outline:none;transition:background .15s ease}',
        '#luogu-rand-allow-ac:before{content:"";position:absolute;width:18px;height:18px;left:2px;top:2px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.25);transition:transform .15s ease}',
        '#luogu-rand-allow-ac:checked{background:#3498db}',
        '#luogu-rand-allow-ac:checked:before{transform:translateX(20px)}',
        '#luogu-rand-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
        '.luogu-rand-btn{height:36px;border:none;border-radius:11px;color:#fff;font-weight:800;cursor:pointer;transition:opacity .12s ease,transform .12s ease;font-size:1em}',
        '.luogu-rand-btn:hover{opacity:.88;transform:translateY(-1px)}',
        '.luogu-rand-btn:disabled{opacity:.55;cursor:not-allowed;transform:none}',
        '#luogu-rand-random{grid-column:span 2;background:#3498db;height:40px;font-size:1.05em}',
        '#luogu-rand-refresh{background:#e67e22}',
        '#luogu-rand-black{background:#c0392b}',
        '#luogu-rand-viewblack{background:#8e44ad}',
        '#luogu-rand-clearblack{background:#6c757d}',
        '#luogu-rand-status{margin-top:10px;padding:8px 10px;border-radius:10px;background:#f7f8fa;color:#666;font-size:.86em;line-height:1.45;word-break:break-word}',
        '#luogu-rand-blacklist{display:none;margin-top:10px;padding:8px;border-radius:12px;background:#f7f8fa;max-height:160px;overflow:auto}',
        '#luogu-rand-blacklist.show{display:block}',
        '.luogu-rand-black-item{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:9px;background:#fff;margin-bottom:6px;box-shadow:0 1px 4px rgba(0,0,0,.05)}',
        '.luogu-rand-black-item a{color:#3498db;font-weight:800;text-decoration:none}',
        '.luogu-rand-black-item button{width:48px;height:26px;border:none;border-radius:8px;background:#e74c3c;color:#fff;font-weight:800;cursor:pointer}',
        '#luogu-rand-resize-hint{position:absolute;right:7px;bottom:4px;color:#aaa;font-size:12px;pointer-events:none}'
    ].join('\n'));

    function rand(l, r) {
        return Math.floor(Math.random() * (r - l + 1)) + l;
    }

    function shuffle(a) {
        var i;

        for (i = a.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var t = a[i];

            a[i] = a[j];
            a[j] = t;
        }

        return a;
    }

    function sameArray(a, b) {
        var i;

        if (!a || !b) return false;
        if (a.length !== b.length) return false;

        for (i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) return false;
        }

        return true;
    }

    function buildListUrl(page, diff) {
        return BASE + '/problem/list?type=luogu&page=' + page + '&difficulty=' + diff;
    }

    function buildProblemUrl(pid) {
        return BASE + '/problem/' + pid;
    }

    function getCurrentProblemId() {
        var match = location.pathname.match(/^\/problem\/([A-Z0-9]+)$/i);
        return match ? match[1] : null;
    }

    function setStatus(msg) {
        var node = document.getElementById('luogu-rand-status');
        if (node) node.innerText = msg;
    }

    function formatTime(ts) {
        return ts ? new Date(ts).toLocaleString() : '从未更新';
    }

    function readJSON(key, def) {
        try {
            var value = JSON.parse(localStorage.getItem(key) || 'null');
            return value === null ? def : value;
        } catch (e) {
            return def;
        }
    }

    function writeJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function getUIState() {
        return readJSON(STORAGE_UI, {});
    }

    function saveUIState(box) {
        var old = getUIState();

        var ui = {
            left: old.left || '',
            top: old.top || '',
            right: old.right || '',
            bottom: old.bottom || '',
            width: old.width || '',
            height: old.height || '',
            fontSize: old.fontSize || 14
        };

        if (box && box.style) {
            ui.left = box.style.left || ui.left;
            ui.top = box.style.top || ui.top;
            ui.right = box.style.right || ui.right;
            ui.bottom = box.style.bottom || ui.bottom;
            ui.width = box.style.width || box.getBoundingClientRect().width + 'px';
            ui.height = box.style.height || box.getBoundingClientRect().height + 'px';

            var fs = box.style.getPropertyValue('--luogu-rand-font-size');
            if (fs) ui.fontSize = Number(fs.replace('px', '')) || ui.fontSize;
        }

        writeJSON(STORAGE_UI, ui);
    }

    function restoreUI(box) {
        var ui = getUIState();

        if (ui.left && ui.top) {
            box.style.left = ui.left;
            box.style.top = ui.top;
            box.style.right = 'auto';
            box.style.bottom = 'auto';
        }

        if (ui.width) box.style.width = ui.width;
        if (ui.height) box.style.height = ui.height;

        if (ui.fontSize) {
            box.style.setProperty('--luogu-rand-font-size', Number(ui.fontSize) + 'px');
        }
    }

    function getPageCache() {
        return readJSON(STORAGE_PAGE_CACHE, {});
    }

    function savePageCache(cache) {
        writeJSON(STORAGE_PAGE_CACHE, cache);
    }

    function getCacheEntry(diff) {
        var cache = getPageCache();
        var entry = cache[diff];

        if (!entry) return null;
        if (!Number.isInteger(entry.maxPage)) return null;
        if (!Number.isInteger(entry.pageSize)) return null;
        if (entry.maxPage <= 0 || entry.maxPage > MAX_REASONABLE_PAGE) return null;
        if (entry.pageSize <= 0) return null;

        return entry;
    }

    function setCacheEntry(diff, maxPage, pageSize) {
        var cache = getPageCache();
        cache[diff] = {
            maxPage: maxPage,
            pageSize: pageSize,
            totalCount: maxPage * pageSize,
            updatedAt: Date.now()
        };
        savePageCache(cache);
    }

    function clearCurrentDifficultyCache(diff) {
        var cache = getPageCache();
        delete cache[diff];
        savePageCache(cache);
    }

    function isExpired(entry) {
        return !entry.updatedAt || Date.now() - entry.updatedAt > CACHE_TTL;
    }

    function getBlacklist() {
        var list = readJSON(STORAGE_BLACKLIST, []);
        return Array.isArray(list) ? list : [];
    }

    function saveBlacklist(list) {
        writeJSON(STORAGE_BLACKLIST, Array.from(new Set(list)));
    }

    function addToBlacklist(pid) {
        var list = getBlacklist();

        if (list.indexOf(pid) === -1) {
            list.push(pid);
            saveBlacklist(list);
        }
    }

    function removeFromBlacklist(pid) {
        var list = getBlacklist().filter(function (x) {
            return x !== pid;
        });

        saveBlacklist(list);
    }

    function clearBlacklist() {
        saveBlacklist([]);
    }

    async function fetchPageDoc(url) {
        var res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
        });

        if (!res.ok) {
            throw new Error('请求失败：HTTP ' + res.status);
        }

        var html = await res.text();

        if (!html || html.trim().length === 0) {
            throw new Error('洛谷返回空页面');
        }

        return new DOMParser().parseFromString(html, 'text/html');
    }

    function rowLooksAccepted(row) {
        if (!row) return false;

        var statusNode =
            row.querySelector('.status') ||
            row.querySelector('[class~="status"]') ||
            row.querySelector('[class*="status"]');

        if (!statusNode) {
            return false;
        }

        var html = statusNode.innerHTML || '';
        var text = statusNode.innerText || '';

        if (/fa-check/.test(html)) return true;
        if (/data-icon=["']check/.test(html)) return true;
        if (/lcolor--green/.test(html)) return true;
        if (/--green/.test(html)) return true;
        if (/rgb\(\s*82\s*,\s*196\s*,\s*26\s*\)/.test(html)) return true;
        if (/已通过|Accepted|\bAC\b/.test(text)) return true;

        return false;
    }

    function findProblemRowFromAnchor(a) {
        var p = a;

        while (p && p !== document && p.nodeType === 1) {
            if (
                p.classList &&
                (
                    p.classList.contains('row') ||
                    p.classList.contains('row-wrap') ||
                    p.tagName === 'TR'
                )
            ) {
                return p;
            }

            p = p.parentElement;
        }

        return a.parentElement;
    }

    function parseProblemsFromDOM(doc, allowAC) {
        var map = new Map();
        var anchors = doc.querySelectorAll('a[href^="/problem/"],a[href^="https://www.luogu.com.cn/problem/"]');

        anchors.forEach(function (a) {
            var href = a.getAttribute('href') || '';
            var url;

            try {
                url = new URL(href, BASE);
            } catch (e) {
                return;
            }

            var path = url.pathname;
            var match = path.match(/^\/problem\/([A-Z0-9]+)$/i);

            if (!match) return;

            var pid = match[1];

            if (!pid || !/^[A-Z0-9]+$/i.test(pid)) return;

            var row = findProblemRowFromAnchor(a);
            var accepted = rowLooksAccepted(row);

            if (!allowAC && accepted) return;

            if (!map.has(pid)) {
                map.set(pid, {
                    pid: pid,
                    accepted: accepted
                });
            }
        });

        return Array.from(map.values());
    }

    async function fetchPageProblems(diff, page, allowAC) {
        var doc = await fetchPageDoc(buildListUrl(page, diff));
        return parseProblemsFromDOM(doc, allowAC);
    }

    function problemsToPids(problems) {
        var ans = [];

        problems.forEach(function (item) {
            if (item && item.pid) ans.push(String(item.pid));
        });

        return ans;
    }

    async function samePageContent(diff, page) {
        var a = problemsToPids(await fetchPageProblems(diff, page, true));
        var b = problemsToPids(await fetchPageProblems(diff, page + 1, true));

        if (a.length === 0) return false;
        if (b.length === 0) return false;

        return sameArray(a, b);
    }

    async function getPagePidsForMaxDetect(diff, page) {
        var problems = await fetchPageProblems(diff, page, true);
        return problemsToPids(problems);
    }

    async function isOverflowPage(diff, page) {
        var cur = await getPagePidsForMaxDetect(diff, page);
        var nxt = await getPagePidsForMaxDetect(diff, page + 1);

        if (cur.length === 0) return true;
        if (nxt.length === 0) return true;

        return sameArray(cur, nxt);
    }

    /*
    合并策略：

    1. 有缓存：
       从缓存的 maxPage 开始检查 maxPage 和 maxPage + 1。
       如果相同，说明没有新增页。
       如果不同，继续向后指数探测新增范围，再二分。

    2. 没缓存：
       从 1 开始指数探测，再二分。

    这样：
    - 第一次不会从 1 一页页扫。
    - 后续刷新通常只请求 2 页。
    - 如果洛谷新增题目，也能继续向后找。
    */
    async function refreshMaxPage(diff) {
        setStatus('正在探测难度 ' + diff + ' 的最大页...');

        var oldEntry = getCacheEntry(diff);
        var firstProblems = await fetchPageProblems(diff, 1, true);
        var firstPids = problemsToPids(firstProblems);

        if (firstPids.length === 0) {
            throw new Error('第一页没有解析到题目，无法探测最大页');
        }

        var pageSize = firstPids.length;

        var l;
        var r;

        if (oldEntry && oldEntry.maxPage > 0) {
            setStatus('已有缓存最大页 ' + oldEntry.maxPage + '，从缓存附近开始刷新...');

            if (await isOverflowPage(diff, oldEntry.maxPage)) {
                setCacheEntry(diff, oldEntry.maxPage, pageSize);

                setStatus(
                    '最大页未变化：难度 ' + diff +
                    '，最大页 ' + oldEntry.maxPage +
                    '，每页 ' + pageSize + ' 题'
                );

                return oldEntry.maxPage;
            }

            l = oldEntry.maxPage;
            r = oldEntry.maxPage + 1;

            while (r <= MAX_REASONABLE_PAGE) {
                setStatus('正在向后探测：检查第 ' + r + ' 页和第 ' + (r + 1) + ' 页...');

                if (await isOverflowPage(diff, r)) {
                    break;
                }

                l = r;
                r = r * 2;
            }
        } else {
            setStatus('【第一次缓存该难度，可能耗时较长】没有缓存，从第一页开始指数探测...');

            if (await isOverflowPage(diff, 1)) {
                setCacheEntry(diff, 1, pageSize);

                setStatus('【第一次缓存该难度，可能耗时较长】已缓存难度 ' + diff + '：最大页 1，每页 ' + pageSize + ' 题');

                return 1;
            }

            l = 1;
            r = 2;

            while (r <= MAX_REASONABLE_PAGE) {
                setStatus('【第一次缓存该难度，可能耗时较长】正在指数探测：检查第 ' + r + ' 页和第 ' + (r + 1) + ' 页...');

                if (await isOverflowPage(diff, r)) {
                    break;
                }

                l = r;
                r = r * 2;
            }
        }

        if (r > MAX_REASONABLE_PAGE) {
            r = MAX_REASONABLE_PAGE;
        }

        var ans = r;
        var left = l + 1;
        var right = r;

        while (left <= right) {
            var mid = Math.floor((left + right) / 2);

            setStatus('【第一次缓存该难度，可能耗时较长】正在二分最大页：' + left + ' ~ ' + right + '，检查 ' + mid);

            if (await isOverflowPage(diff, mid)) {
                ans = mid;
                right = mid - 1;
            } else {
                left = mid + 1;
            }
        }

        if (!Number.isInteger(ans) || ans <= 0 || ans > MAX_REASONABLE_PAGE) {
            throw new Error('最大页数异常：maxPage=' + ans);
        }

        setCacheEntry(diff, ans, pageSize);

        setStatus(
            '已缓存难度 ' + diff +
            '：最大页 ' + ans +
            '，每页 ' + pageSize + ' 题'
        );

        return ans;
    }

    async function getMaxPageWithCache(diff) {
        var entry = getCacheEntry(diff);

        if (!entry) {
            setStatus('当前难度尚未缓存页数，开始探测最大页...');
            await refreshMaxPage(diff);
            return getCacheEntry(diff);
        }

        if (isExpired(entry)) {
            setStatus('当前难度页数缓存超过 7 天，开始自动刷新...');
            await refreshMaxPage(diff);
            return getCacheEntry(diff);
        }

        setStatus(
            '读取缓存：最大页 ' + entry.maxPage +
            '；每页 ' + entry.pageSize +
            ' 题；上次更新：' + formatTime(entry.updatedAt)
        );

        return entry;
    }

    async function fetchCandidatesFromPage(diff, page, allowAC) {
        var problems = await fetchPageProblems(diff, page, allowAC);
        return problemsToPids(problems);
    }

    async function pickProblem(diff, allowAC) {
        var entry = await getMaxPageWithCache(diff);
        var blacklist = getBlacklist();

        var attempt;

        for (attempt = 1; attempt <= MAX_RANDOM_ATTEMPT; attempt++) {
            var page = rand(1, entry.maxPage);

            setStatus('随机第 ' + page + '/' + entry.maxPage + ' 页，第 ' + attempt + ' 次尝试...');

            /*
            注意：
            这里必须用 true 获取完整列表。
            如果这里传 allowAC=false，那么 parseProblemsFromDOM 会提前过滤 AC，
            但我们就没法明确知道到底是这一页全 AC，还是解析失败。
        */
            var problems = await fetchPageProblems(diff, page, true);

            var candidates = problems.filter(function (item) {
                if (!item || !item.pid) return false;

                var pid = String(item.pid);

                if (blacklist.indexOf(pid) !== -1) {
                    return false;
                }

                if (!allowAC && item.accepted) {
                    return false;
                }

                return true;
            }).map(function (item) {
                return String(item.pid);
            });

            shuffle(candidates);

            if (candidates.length > 0) {
                return candidates[0];
            }
        }

        throw new Error('连续多次没有可抽题目，可能该难度题目大多已 AC 或被拉黑');
    }

    async function randomProblem(diff, allowAC) {
        localStorage.setItem(STORAGE_DIFF, diff);
        localStorage.setItem(STORAGE_ALLOW_AC, allowAC ? '1' : '0');

        var pid = await pickProblem(diff, allowAC);

        setStatus('抽中 ' + pid + '，正在打开...');
        location.href = buildProblemUrl(pid);
    }

    async function refreshCurrentDifficulty(diff) {
        await refreshMaxPage(diff);
    }

    function updateStatusByDiff(diff) {
        var entry = getCacheEntry(diff);

        if (!entry) {
            setStatus('当前难度尚未缓存页数，首次随机会自动探测最大页');
            return;
        }

        var state = isExpired(entry) ? '已过期，下次自动刷新' : '未过期';

        setStatus(
            '当前难度最大页：' + entry.maxPage +
            '；每页 ' + entry.pageSize +
            ' 题；上次更新：' + formatTime(entry.updatedAt) +
            '；状态：' + state
        );
    }

    function setActiveDifficulty(diff) {
        var buttons = document.querySelectorAll('.luogu-rand-diff-btn');

        buttons.forEach(function (btn) {
            var active = btn.getAttribute('data-diff') === diff;
            var cur = Number(btn.getAttribute('data-diff'));

            btn.classList.toggle('active', active);

            if (active) {
                btn.style.background = COLOR[Number(diff)];
                btn.style.borderColor = COLOR[Number(diff)];
                btn.style.color = '#fff';
            } else {
                btn.style.background = '#f8f9fb';
                btn.style.borderColor = 'rgba(0,0,0,.08)';
                btn.style.color = COLOR[cur];
            }
        });

        localStorage.setItem(STORAGE_DIFF, diff);
        updateStatusByDiff(diff);
    }

    function updateBlacklistPanel() {
        var panel = document.getElementById('luogu-rand-blacklist');
        if (!panel) return;

        var list = getBlacklist();

        panel.innerHTML = '';

        if (list.length === 0) {
            panel.innerHTML = '<div style="color:#777;">当前拉黑列表为空</div>';
            return;
        }

        list.forEach(function (pid) {
            var item = document.createElement('div');
            item.className = 'luogu-rand-black-item';

            var link = document.createElement('a');
            link.href = buildProblemUrl(pid);
            link.target = '_blank';
            link.textContent = pid;

            var removeBtn = document.createElement('button');
            removeBtn.textContent = '移除';
            removeBtn.onclick = function () {
                removeFromBlacklist(pid);
                updateBlacklistPanel();
                setStatus('已移除拉黑题目 ' + pid);
            };

            item.appendChild(link);
            item.appendChild(removeBtn);
            panel.appendChild(item);
        });
    }

    function applyFontSize(size) {
        size = Math.max(11, Math.min(22, size));

        var box = document.getElementById('luogu-rand-box');
        if (!box) return;

        box.style.setProperty('--luogu-rand-font-size', size + 'px');

        var ui = getUIState();
        ui.fontSize = size;
        saveUIState(ui);
    }

    function enableDrag(box, header) {
        var dragging = false;
        var startX = 0;
        var startY = 0;
        var startLeft = 0;
        var startTop = 0;

        header.addEventListener('mousedown', function (e) {
            if (e.target.closest('button')) return;

            dragging = true;
            startX = e.clientX;
            startY = e.clientY;

            var rect = box.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;

            box.style.left = startLeft + 'px';
            box.style.top = startTop + 'px';
            box.style.right = 'auto';
            box.style.bottom = 'auto';

            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', function (e) {
            if (!dragging) return;

            var dx = e.clientX - startX;
            var dy = e.clientY - startY;

            var newLeft = Math.max(0, Math.min(window.innerWidth - 80, startLeft + dx));
            var newTop = Math.max(0, Math.min(window.innerHeight - 60, startTop + dy));

            box.style.left = newLeft + 'px';
            box.style.top = newTop + 'px';
        });

        window.addEventListener('mouseup', function () {
            if (!dragging) return;

            dragging = false;
            document.body.style.userSelect = '';

            var ui = getUIState();
            ui.left = box.style.left;
            ui.top = box.style.top;
            ui.right = 'auto';
            ui.bottom = 'auto';
            ui.width = box.style.width || box.getBoundingClientRect().width + 'px';
            ui.height = box.style.height || box.getBoundingClientRect().height + 'px';
            writeJSON(STORAGE_UI, ui);
        });
    }

    function observeResize(box) {
        if (typeof ResizeObserver === 'undefined') return;

        var timer = null;

        var observer = new ResizeObserver(function () {
            clearTimeout(timer);

            timer = setTimeout(function () {
                var ui = getUIState();
                ui.width = box.style.width || box.getBoundingClientRect().width + 'px';
                ui.height = box.style.height || box.getBoundingClientRect().height + 'px';
                writeJSON(STORAGE_UI, ui);
            }, 200);
        });

        observer.observe(box);
    }

    function createUI() {
        if (document.getElementById('luogu-rand-box')) return;

        var box = document.createElement('div');
        box.id = 'luogu-rand-box';

        var header = document.createElement('div');
        header.id = 'luogu-rand-header';

        var title = document.createElement('div');
        title.id = 'luogu-rand-title';
        title.textContent = '洛谷随机题';

        var fontTools = document.createElement('div');
        fontTools.id = 'luogu-rand-font-tools';

        var smallBtn = document.createElement('button');
        smallBtn.className = 'luogu-rand-mini-btn';
        smallBtn.textContent = 'A−';

        var bigBtn = document.createElement('button');
        bigBtn.className = 'luogu-rand-mini-btn';
        bigBtn.textContent = 'A+';

        fontTools.appendChild(smallBtn);
        fontTools.appendChild(bigBtn);
        header.appendChild(title);
        header.appendChild(fontTools);

        var diffGrid = document.createElement('div');
        diffGrid.id = 'luogu-rand-diff-grid';

        var savedDiff = localStorage.getItem(STORAGE_DIFF) || '3';

        difficulties.forEach(function (item) {
            var value = item[0];
            var name = item[1];

            var btn = document.createElement('button');
            btn.className = 'luogu-rand-diff-btn';
            btn.setAttribute('data-diff', value);
            btn.textContent = name;
            btn.style.color = COLOR[Number(value)];
            btn.onclick = function () {
                setActiveDifficulty(value);
            };

            diffGrid.appendChild(btn);
        });

        var optionRow = document.createElement('div');
        optionRow.id = 'luogu-rand-option-row';

        var allowLabel = document.createElement('label');
        allowLabel.htmlFor = 'luogu-rand-allow-ac';
        allowLabel.textContent = '允许随机已 AC 题';

        var allowAC = document.createElement('input');
        allowAC.type = 'checkbox';
        allowAC.id = 'luogu-rand-allow-ac';
        allowAC.checked = localStorage.getItem(STORAGE_ALLOW_AC) === '1';
        allowAC.onchange = function () {
            localStorage.setItem(STORAGE_ALLOW_AC, allowAC.checked ? '1' : '0');
        };

        optionRow.appendChild(allowLabel);
        optionRow.appendChild(allowAC);

        var actions = document.createElement('div');
        actions.id = 'luogu-rand-actions';

        var randomBtn = document.createElement('button');
        randomBtn.id = 'luogu-rand-random';
        randomBtn.className = 'luogu-rand-btn';
        randomBtn.textContent = '随机一道题';

        var refreshBtn = document.createElement('button');
        refreshBtn.id = 'luogu-rand-refresh';
        refreshBtn.className = 'luogu-rand-btn';
        refreshBtn.textContent = '刷新页数';

        var blackBtn = document.createElement('button');
        blackBtn.id = 'luogu-rand-black';
        blackBtn.className = 'luogu-rand-btn';
        blackBtn.textContent = '拉黑当前';

        var viewBlackBtn = document.createElement('button');
        viewBlackBtn.id = 'luogu-rand-viewblack';
        viewBlackBtn.className = 'luogu-rand-btn';
        viewBlackBtn.textContent = '拉黑列表';

        var clearBlackBtn = document.createElement('button');
        clearBlackBtn.id = 'luogu-rand-clearblack';
        clearBlackBtn.className = 'luogu-rand-btn';
        clearBlackBtn.textContent = '清空拉黑';

        actions.appendChild(randomBtn);
        actions.appendChild(refreshBtn);
        actions.appendChild(blackBtn);
        actions.appendChild(viewBlackBtn);
        actions.appendChild(clearBlackBtn);

        var status = document.createElement('div');
        status.id = 'luogu-rand-status';

        var blacklistPanel = document.createElement('div');
        blacklistPanel.id = 'luogu-rand-blacklist';

        var resizeHint = document.createElement('div');
        resizeHint.id = 'luogu-rand-resize-hint';
        resizeHint.textContent = '↘';

        box.appendChild(header);
        box.appendChild(diffGrid);
        box.appendChild(optionRow);
        box.appendChild(actions);
        box.appendChild(status);
        box.appendChild(blacklistPanel);
        box.appendChild(resizeHint);

        document.body.appendChild(box);

        function setBusy(busy) {
            var btns = actions.querySelectorAll('button');

            btns.forEach(function (btn) {
                btn.disabled = busy;
            });

            randomBtn.textContent = busy ? '随机中...' : '随机一道题';
            refreshBtn.textContent = busy ? '处理中...' : '刷新页数';
        }

        randomBtn.onclick = async function () {
            setBusy(true);

            try {
                await randomProblem(localStorage.getItem(STORAGE_DIFF) || savedDiff, allowAC.checked);
            } catch (e) {
                console.error(e);
                setStatus(e.message || String(e));
                alert(e.message || String(e));
            } finally {
                setBusy(false);
            }
        };

        refreshBtn.onclick = async function () {
            setBusy(true);

            try {
                await refreshCurrentDifficulty(localStorage.getItem(STORAGE_DIFF) || savedDiff);
            } catch (e) {
                console.error(e);
                setStatus(e.message || String(e));
                alert(e.message || String(e));
            } finally {
                setBusy(false);
            }
        };

        blackBtn.onclick = function () {
            var pid = getCurrentProblemId();

            if (!pid) {
                setStatus('当前不是题目页，无法拉黑当前题目');
                return;
            }

            addToBlacklist(pid);
            updateBlacklistPanel();
            setStatus('已拉黑题目 ' + pid);
        };

        viewBlackBtn.onclick = function () {
            blacklistPanel.classList.toggle('show');
            updateBlacklistPanel();
        };

        clearBlackBtn.onclick = function () {
            if (!confirm('确定清空所有拉黑题目吗？')) return;

            clearBlacklist();
            updateBlacklistPanel();
            setStatus('已清空拉黑列表');
        };

        smallBtn.onclick = function () {
            applyFontSize(Number(getUIState().fontSize || 14) - 1);
            saveUIState(box);
        };

        bigBtn.onclick = function () {
            applyFontSize(Number(getUIState().fontSize || 14) + 1);
            saveUIState(box);
        };

        restoreUI(box);
        enableDrag(box, header);
        observeResize(box);
        setActiveDifficulty(savedDiff);
        updateBlacklistPanel();
    }

    createUI();
}());
