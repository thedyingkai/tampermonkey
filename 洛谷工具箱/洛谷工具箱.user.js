// ==UserScript==
// @name         洛谷工具箱（随机题 / 难度染色 / 难度统计）
// @namespace    https://github.com/thedyingkai/tampermonkey
// @version      3.0.2
// @description  合并洛谷随机题、难度染色、练习难度统计；统一可扩展设置界面；全部 fetch 请求统一限制为最多 2 次/秒
// @author       thedyingkai
// @match        https://www.luogu.com.cn/*
// @icon         https://www.luogu.com.cn/favicon.ico
// @license      MIT
// @grant        none
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/thedyingkai/tampermonkey/main/%E6%B4%9B%E8%B0%B7%E5%B7%A5%E5%85%B7%E7%AE%B1/%E6%B4%9B%E8%B0%B7%E5%B7%A5%E5%85%B7%E7%AE%B1.user.js
// @updateURL    https://raw.githubusercontent.com/thedyingkai/tampermonkey/main/%E6%B4%9B%E8%B0%B7%E5%B7%A5%E5%85%B7%E7%AE%B1/%E6%B4%9B%E8%B0%B7%E5%B7%A5%E5%85%B7%E7%AE%B1.user.js
// ==/UserScript==

(function () {
    'use strict';

    if (window.top !== window.self) return;

    const BASE = 'https://www.luogu.com.cn';

    const DIFFICULTIES = [
        { id: 0, name: '暂无评定', color: 'rgb(191, 191, 191)' },
        { id: 1, name: '入门', color: 'rgb(254, 76, 97)' },
        { id: 2, name: '普及−', color: 'rgb(243, 156, 17)' },
        { id: 3, name: '普及/提高−', color: 'rgb(255, 193, 22)' },
        { id: 4, name: '普及+/提高', color: 'rgb(82, 196, 26)' },
        { id: 5, name: '提高+/省选−', color: 'rgb(52, 152, 219)' },
        { id: 6, name: '省选/NOI−', color: 'rgb(157, 61, 207)' },
        { id: 7, name: 'NOI/NOI+/CTSC', color: 'rgb(14, 29, 105)' },
    ];

    const COLOR = DIFFICULTIES.map(x => x.color);

    const KEY = {
        settings: 'tdk_luogu_toolbox_settings_v3',
        ui: 'tdk_luogu_toolbox_ui_v3',
        diffCache: 'tdk_luogu_problem_difficulty_cache_v8',
        blockUntil: 'tdk_luogu_problem_difficulty_block_until_v16',
        randomPageCache: 'luogu_rand_page_cache_v1.3',
        randomBlacklist: 'luogu_rand_blacklist_v1.3',
        chartMemoryRecentTotal: 'tdk_luogu_recent_total',
        oldRandomDiff: 'luogu_rand_diff_v1.3',
        oldAllowAC: 'luogu_rand_allow_ac_v1.3',
    };

    const DEFAULT_SETTINGS = {
        modules: {
            random: true,
            color: true,
            chart: true,
        },
        request: {
            maxPerSecond: 2,
            cooldownMs: 10000,
        },
        random: {
            difficulty: localStorage.getItem(KEY.oldRandomDiff) || '3',
            allowAC: localStorage.getItem(KEY.oldAllowAC) === '1',
            cacheTtlDays: 7,
            maxReasonablePage: 1000,
            maxRandomAttempt: 40,
            autoMinimize: true,
        },
        color: {
            autoFetchFirstBatch: true,
            autoContinueBatch: true,
            batchSize: 60,
            concurrency: 4,
            blockGapMs: 1000,
            noProgressGapMs: 1000,
            problemPageFallback: true,
        },
        chart: {
            recentTotal: Number(localStorage.getItem(KEY.chartMemoryRecentTotal) || 50),
            minRecentTotal: 5,
            maxRecentTotal: 300,
            recordPageLimit: 20,
            replaceHomeSlider: true,
        },
    };

    const SETTING_SCHEMA = [
        {
            title: '模块开关',
            items: [
                { path: 'modules.random', label: '启用随机题面板', type: 'boolean' },
                { path: 'modules.color', label: '启用难度染色', type: 'boolean' },
                { path: 'modules.chart', label: '启用难度统计图', type: 'boolean' },
            ],
        },
        {
            title: '请求限制',
            items: [
                { path: 'request.maxPerSecond', label: '最大请求频率（次/秒，硬上限 2）', type: 'number', min: 0.2, max: 2, step: 0.1 },
                { path: 'request.cooldownMs', label: '被限流后的冷却时间（ms）', type: 'number', min: 1000, max: 60000, step: 1000 },
            ],
        },
        {
            title: '随机题',
            items: [
                { path: 'random.difficulty', label: '默认难度', type: 'select', options: DIFFICULTIES.slice(1).map(x => ({ value: String(x.id), label: x.name })) },
                { path: 'random.allowAC', label: '允许随机已 AC 题', type: 'boolean' },
                { path: 'random.autoMinimize', label: '随机成功后自动最小化', type: 'boolean' },
                { path: 'random.cacheTtlDays', label: '页数缓存有效期（天）', type: 'number', min: 1, max: 30, step: 1 },
                { path: 'random.maxRandomAttempt', label: '随机空页最大重试次数', type: 'number', min: 5, max: 200, step: 1 },
            ],
        },
        {
            title: '难度染色',
            items: [
                { path: 'color.autoFetchFirstBatch', label: '练习页自动拉取第一批缺失难度', type: 'boolean' },
                { path: 'color.autoContinueBatch', label: '练习页自动继续分批拉取', type: 'boolean' },
                { path: 'color.batchSize', label: '每批处理题数', type: 'number', min: 1, max: 200, step: 1 },
                { path: 'color.concurrency', label: '并发任务数（请求仍受 2 次/秒限制）', type: 'number', min: 1, max: 20, step: 1 },
                { path: 'color.problemPageFallback', label: '题库搜索失败时回退题面页解析', type: 'boolean' },
            ],
        },
        {
            title: '统计图',
            items: [
                { path: 'chart.recentTotal', label: '最近通过题目数量', type: 'number', min: 5, max: 300, step: 1 },
                { path: 'chart.recordPageLimit', label: '最多扫描提交记录页数', type: 'number', min: 1, max: 100, step: 1 },
                { path: 'chart.replaceHomeSlider', label: '首页替换轮播图', type: 'boolean' },
            ],
        },
    ];

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function clamp(x, l, r) {
        x = Number(x);
        if (!Number.isFinite(x)) x = l;
        return Math.max(l, Math.min(r, x));
    }

    function validDiff(diff) {
        diff = Number(diff);
        return Number.isInteger(diff) && diff >= 0 && diff < COLOR.length;
    }

    function escapeHtml(s) {
        return String(s)
            .replaceAll('&', '&amp;')
            .replaceAll('<', '&lt;')
            .replaceAll('>', '&gt;')
            .replaceAll('"', '&quot;')
            .replaceAll("'", '&#39;');
    }

    function readJSON(key, def) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || 'null');
            return value === null ? def : value;
        } catch (_) {
            return def;
        }
    }

    function writeJSON(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    function deepMerge(base, patch) {
        if (!patch || typeof patch !== 'object') return structuredCloneSafe(base);

        const ans = Array.isArray(base) ? [...base] : { ...base };

        for (const [key, value] of Object.entries(patch)) {
            if (
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                base &&
                typeof base[key] === 'object' &&
                !Array.isArray(base[key])
            ) {
                ans[key] = deepMerge(base[key], value);
            } else {
                ans[key] = value;
            }
        }

        return ans;
    }

    function structuredCloneSafe(x) {
        try {
            return structuredClone(x);
        } catch (_) {
            return JSON.parse(JSON.stringify(x));
        }
    }

    let settings = normalizeSettings(readJSON(KEY.settings, {}));

    function saveSettings(options = {}) {
        const opts = {
            refreshSettings: options.refreshSettings !== false,
            random: options.random !== false,
            chart: options.chart === true,
            color: options.color === true,
        };

        settings = normalizeSettings(settings);
        localStorage.setItem(KEY.chartMemoryRecentTotal, String(settings.chart.recentTotal));
        writeJSON(KEY.settings, settings);

        if (opts.refreshSettings) Toolbox.refreshSettingsPanel();
        if (opts.random) Toolbox.syncRandomControls();
        else Toolbox.updateMiniPanel();
        Toolbox.applyModuleState();

        if (opts.chart) {
            if (settings.modules.chart) ChartModule.render(true);
            else ChartModule.removeOld();
        }
        if (opts.color) {
            if (settings.modules.color) ColorModule.render();
            else ColorModule.clearRendered();
        }
    }

    function getByPath(obj, path) {
        return path.split('.').reduce((cur, key) => cur && cur[key], obj);
    }

    function setByPath(obj, path, value) {
        const keys = path.split('.');
        let cur = obj;
        for (let i = 0; i + 1 < keys.length; i++) cur = cur[keys[i]];
        cur[keys[keys.length - 1]] = value;
    }

    function normalizeSettings(input) {
        const next = deepMerge(DEFAULT_SETTINGS, input && typeof input === 'object' && !Array.isArray(input) ? input : {});

        next.modules = next.modules && typeof next.modules === 'object' && !Array.isArray(next.modules) ? next.modules : structuredCloneSafe(DEFAULT_SETTINGS.modules);
        next.request = next.request && typeof next.request === 'object' && !Array.isArray(next.request) ? next.request : structuredCloneSafe(DEFAULT_SETTINGS.request);
        next.random = next.random && typeof next.random === 'object' && !Array.isArray(next.random) ? next.random : structuredCloneSafe(DEFAULT_SETTINGS.random);
        next.color = next.color && typeof next.color === 'object' && !Array.isArray(next.color) ? next.color : structuredCloneSafe(DEFAULT_SETTINGS.color);
        next.chart = next.chart && typeof next.chart === 'object' && !Array.isArray(next.chart) ? next.chart : structuredCloneSafe(DEFAULT_SETTINGS.chart);

        for (const key of Object.keys(DEFAULT_SETTINGS.modules)) {
            next.modules[key] = next.modules[key] !== false;
        }

        next.request.maxPerSecond = clamp(next.request.maxPerSecond, 0.2, 2);
        next.request.cooldownMs = Math.floor(clamp(next.request.cooldownMs, 1000, 60000));

        next.random.difficulty = validDiff(next.random.difficulty) && Number(next.random.difficulty) > 0 ? String(Number(next.random.difficulty)) : '3';
        next.random.allowAC = next.random.allowAC === true;
        next.random.cacheTtlDays = Math.floor(clamp(next.random.cacheTtlDays, 1, 30));
        next.random.maxReasonablePage = Math.floor(clamp(next.random.maxReasonablePage, 1, 10000));
        next.random.maxRandomAttempt = Math.floor(clamp(next.random.maxRandomAttempt, 5, 200));
        next.random.autoMinimize = next.random.autoMinimize !== false;

        next.color.autoFetchFirstBatch = next.color.autoFetchFirstBatch !== false;
        next.color.autoContinueBatch = next.color.autoContinueBatch !== false;
        next.color.batchSize = Math.floor(clamp(next.color.batchSize, 1, 200));
        next.color.concurrency = Math.floor(clamp(next.color.concurrency, 1, 20));
        next.color.blockGapMs = Math.floor(clamp(next.color.blockGapMs, 0, 60000));
        next.color.noProgressGapMs = Math.floor(clamp(next.color.noProgressGapMs, 0, 60000));
        next.color.problemPageFallback = next.color.problemPageFallback !== false;

        next.chart.minRecentTotal = Math.floor(clamp(next.chart.minRecentTotal, 1, 300));
        next.chart.maxRecentTotal = Math.floor(clamp(next.chart.maxRecentTotal, next.chart.minRecentTotal, 300));
        next.chart.recentTotal = Math.floor(clamp(next.chart.recentTotal, next.chart.minRecentTotal, next.chart.maxRecentTotal));
        next.chart.recordPageLimit = Math.floor(clamp(next.chart.recordPageLimit, 1, 100));
        next.chart.replaceHomeSlider = next.chart.replaceHomeSlider !== false;

        return next;
    }

    function getPidFromHref(href) {
        const m = (href || '').match(/\/problem\/([^/?#]+)/);
        return m ? decodeURIComponent(m[1]) : null;
    }

    function getPid(el) {
        if (!el) return null;

        if (el.getAttribute) {
            const pid = getPidFromHref(el.getAttribute('href'));
            if (pid) return pid;
        }

        return (el.textContent || '').trim();
    }

    function buildProblemUrl(pid) {
        return BASE + '/problem/' + pid;
    }

    function currentProblemId() {
        const match = location.pathname.match(/^\/problem\/([^/?#]+)$/i);
        return match ? decodeURIComponent(match[1]) : null;
    }

    const RequestQueue = {
        queue: [],
        draining: false,
        lastStart: 0,
        total: 0,
        active: 0,

        get interval() {
            return Math.ceil(1000 / clamp(settings.request.maxPerSecond, 0.2, 2));
        },

        get blockUntil() {
            return Number(localStorage.getItem(KEY.blockUntil) || 0);
        },

        setBlocked() {
            const until = Date.now() + Math.floor(clamp(settings.request.cooldownMs, 1000, 60000));
            localStorage.setItem(KEY.blockUntil, String(until));
            Toolbox.setStatus(`洛谷返回限流状态，暂停请求到 ${new Date(until).toLocaleTimeString()}`);
            ColorModule.schedulePracticeContinue(Math.max(0, until - Date.now()) + 200);
            ColorModule.scheduleContestContinue(Math.max(0, until - Date.now()) + 200);
        },

        async waitAvailableSlot() {
            const blockWait = this.blockUntil - Date.now();
            if (blockWait > 0) await sleep(blockWait + 20);

            const wait = this.lastStart + this.interval - Date.now();
            if (wait > 0) await sleep(wait);
        },

        fetch(url, options = {}) {
            return new Promise((resolve, reject) => {
                this.queue.push({ url, options, resolve, reject });
                this.drain();
            });
        },

        async drain() {
            if (this.draining) return;
            this.draining = true;

            while (this.queue.length) {
                const item = this.queue.shift();
                await this.waitAvailableSlot();

                this.lastStart = Date.now();
                this.total++;
                this.active++;
                Toolbox.updateRequestBadge();

                try {
                    const res = await fetch(item.url, item.options);

                    if ([403, 429, 503].includes(res.status)) {
                        this.setBlocked();
                        item.reject(new Error(`rate-limit: HTTP ${res.status}`));
                    } else {
                        item.resolve(res);
                    }
                } catch (err) {
                    item.reject(err);
                } finally {
                    this.active--;
                    Toolbox.updateRequestBadge();
                }
            }

            this.draining = false;
        },

        async text(url, options = {}) {
            const res = await this.fetch(url, options);
            if (!res.ok) throw new Error(`请求失败：HTTP ${res.status}`);
            return await res.text();
        },

        async json(url, options = {}) {
            const text = await this.text(url, options);
            try {
                return JSON.parse(text);
            } catch (_) {
                throw new Error('接口返回不是 JSON');
            }
        },

        async doc(url, options = {}) {
            const text = await this.text(url, options);
            if (!text || text.trim().length === 0) throw new Error('洛谷返回空页面');
            return new DOMParser().parseFromString(text, 'text/html');
        },
    };

    function requestOptions(headers = {}) {
        return {
            method: 'GET',
            credentials: 'include',
            cache: 'no-store',
            headers: {
                'accept': 'application/json, text/plain, */*',
                'x-lentille-request': 'content-only',
                'x-luogu-type': 'content-only',
                ...headers,
            },
        };
    }

    const ProblemDifficulty = {
        cache: {},

        init() {
            this.cache = readJSON(KEY.diffCache, {});

            for (const [pid, diff] of Object.entries(this.cache)) {
                if (!validDiff(diff)) delete this.cache[pid];
            }

            this.save();
        },

        save() {
            writeJSON(KEY.diffCache, this.cache);
        },

        get(pid) {
            if (!pid) return null;
            const diff = this.cache[String(pid)];
            return validDiff(diff) ? Number(diff) : null;
        },

        put(pid, diff) {
            if (!pid || !validDiff(diff)) return false;
            this.cache[String(pid)] = Number(diff);
            return true;
        },

        clear() {
            this.cache = {};
            this.save();
        },

        dfsFindProblem(obj, pid) {
            const vis = new WeakSet();
            let ans = null;

            function dfs(x) {
                if (ans) return;
                if (!x || typeof x !== 'object') return;
                if (vis.has(x)) return;
                vis.add(x);

                if (x.pid != null && String(x.pid) === String(pid) && x.difficulty != null) {
                    ans = x;
                    return;
                }

                if (x.problem && x.problem.pid != null && String(x.problem.pid) === String(pid) && x.problem.difficulty != null) {
                    ans = x.problem;
                    return;
                }

                for (const v of Object.values(x)) dfs(v);
            }

            dfs(obj);
            return ans;
        },

        textVariants(text) {
            return Array.from(new Set([
                text,
                text.replace(/\\"/g, '"'),
                text.replace(/&quot;/g, '"'),
                text.replace(/&quot;/g, '"').replace(/\\"/g, '"'),
            ]));
        },

        parseProblemText(text, pid, loose = false) {
            try {
                const data = JSON.parse(text);
                const problem = this.dfsFindProblem(data, pid);

                if (problem && validDiff(problem.difficulty)) {
                    return Number(problem.difficulty);
                }
            } catch (_) { }

            const safePid = String(pid).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            for (const s of this.textVariants(text)) {
                let m = s.match(new RegExp(`"pid"\\s*:\\s*"${safePid}"[\\s\\S]{0,5000}?"difficulty"\\s*:\\s*(-?\\d+)`));
                if (m && validDiff(m[1])) return Number(m[1]);

                m = s.match(new RegExp(`"difficulty"\\s*:\\s*(-?\\d+)[\\s\\S]{0,5000}?"pid"\\s*:\\s*"${safePid}"`));
                if (m && validDiff(m[1])) return Number(m[1]);

                if (loose) {
                    m = s.match(/"difficulty"\s*:\s*(-?\d+)/);
                    if (m && validDiff(m[1])) return Number(m[1]);
                }
            }

            return null;
        },

        async fetchByPid(pid) {
            const cached = this.get(pid);
            if (cached !== null) return cached;

            let text = await RequestQueue.text(`/problem/list?keyword=${encodeURIComponent(pid)}`, requestOptions());
            let diff = this.parseProblemText(text, pid, false);

            if (validDiff(diff)) {
                this.put(pid, diff);
                this.save();
                return Number(diff);
            }

            if (!settings.color.problemPageFallback) return null;

            text = await RequestQueue.text(`/problem/${encodeURIComponent(pid)}`, requestOptions());
            diff = this.parseProblemText(text, pid, true);

            if (validDiff(diff)) {
                this.put(pid, diff);
                this.save();
                return Number(diff);
            }

            return null;
        },
    };

    const ColorModule = {
        practiceRunning: false,
        practiceAutoDone: false,
        practiceFetching: false,
        autoTimer: null,
        contestFetching: false,
        contestTimer: null,
        renderTimer: null,
        lastBatchEnd: 0,

        isRecordPage() {
            return location.pathname.startsWith('/record/list');
        },

        isPracticePage() {
            return /^\/user\/[^/]+\/practice/.test(location.pathname);
        },

        isContestPage() {
            return /^\/contest\/[^/]+/.test(location.pathname);
        },

        setColor(el, diff) {
            diff = Number(diff);
            if (!validDiff(diff) || !el) return false;

            el.style.color = COLOR[diff];
            el.style.fontWeight = 'bold';
            el.dataset.tdkDiff = String(diff);
            el.dataset.tdkDiffDone = '1';
            return true;
        },

        getFeData() {
            return window._feInstance && window._feInstance.currentData;
        },

        getRecordResult() {
            const data = this.getFeData();
            return data && data.records && data.records.result;
        },

        renderRecordPage() {
            const res = this.getRecordResult();
            if (!Array.isArray(res)) return;

            const mp = new Map();

            for (const item of res) {
                const p = item && item.problem;
                if (!p || p.pid == null || p.difficulty == null) continue;

                const pid = String(p.pid);
                const diff = Number(p.difficulty);

                if (!validDiff(diff)) continue;

                mp.set(pid, diff);
                ProblemDifficulty.put(pid, diff);
            }

            ProblemDifficulty.save();

            document.querySelectorAll('a[href*="/problem/"], .pid').forEach(el => {
                const pid = getPid(el);
                if (!pid || !mp.has(pid)) return;
                this.setColor(el, mp.get(pid));
            });

            const pidEls = Array.from(document.querySelectorAll('.pid'));

            for (let i = 0; i < pidEls.length; i++) {
                const item = res[i];
                const p = item && item.problem;
                if (!p || p.pid == null || p.difficulty == null) continue;

                const pid = String(p.pid);
                const diff = Number(p.difficulty);

                if (!validDiff(diff)) continue;

                this.setColor(pidEls[i], diff);

                const row =
                    pidEls[i].closest('tr') ||
                    pidEls[i].closest('.row') ||
                    pidEls[i].closest('.record') ||
                    pidEls[i].closest('.record-item') ||
                    pidEls[i].parentElement;

                if (!row) continue;

                row.querySelectorAll('a[href*="/problem/"], .pid, .problem-title, .problem-name').forEach(el => {
                    const cur = getPid(el);
                    if (!cur || cur === pid) this.setColor(el, diff);
                });
            }
        },

        findPracticeCard() {
            return Array.from(document.querySelectorAll('.l-card')).find(card => {
                const h3 = card.querySelector('h3');
                if (!h3) return false;

                const title = h3.textContent.trim();
                return title.includes('尝试过的题目') || title.includes('未通过的题目');
            });
        },

        getPracticePidMap() {
            const card = this.findPracticeCard();
            if (!card) return null;

            const links = Array.from(card.querySelectorAll('a[href*="/problem/"]'));
            if (!links.length) return null;

            const mp = new Map();

            for (const a of links) {
                const pid = getPid(a);
                if (!pid) continue;

                if (!mp.has(pid)) mp.set(pid, []);
                mp.get(pid).push(a);
            }

            return mp;
        },

        getContestPidMap() {
            const rows = Array.from(document.querySelectorAll('.row-wrap .row, .list-wrap .row'));
            const mp = new Map();

            for (const row of rows) {
                const a = row.querySelector('a[href*="/problem/"]');
                if (!a) continue;

                const pid = getPid(a);
                if (!pid) continue;

                if (!mp.has(pid)) mp.set(pid, []);
                mp.get(pid).push(a);

                const pidCell = row.querySelector('.pid');
                if (pidCell) mp.get(pid).push(pidCell);

                const titleCell = row.querySelector('.title');
                if (titleCell) {
                    titleCell.querySelectorAll('a[href*="/problem/"]').forEach(x => {
                        if (!mp.get(pid).includes(x)) mp.get(pid).push(x);
                    });
                }
            }

            return mp.size ? mp : null;
        },

        colorByCache(pidMap) {
            let cnt = 0;

            for (const [pid, arr] of pidMap) {
                const diff = ProblemDifficulty.get(pid);
                if (diff === null) continue;

                for (const a of arr) {
                    if (this.setColor(a, diff)) cnt++;
                }
            }

            return cnt;
        },

        isPidRendered(pid, arr) {
            if (!arr.length) return false;

            const diff = ProblemDifficulty.get(pid);
            if (diff !== null) {
                let ok = true;

                for (const a of arr) {
                    if (a.dataset.tdkDiffDone === '1' && validDiff(a.dataset.tdkDiff)) continue;
                    if (!this.setColor(a, diff)) ok = false;
                }

                return ok;
            }

            return arr.every(a => a.dataset.tdkDiffDone === '1' && validDiff(a.dataset.tdkDiff));
        },

        getMissingPids(pidMap) {
            const res = [];

            for (const [pid, arr] of pidMap) {
                if (this.isPidRendered(pid, arr)) continue;
                res.push(pid);
            }

            return res;
        },

        async runQueue(tasks, limit) {
            let cur = 0;

            async function worker() {
                while (cur < tasks.length) {
                    const id = cur++;
                    await tasks[id]();
                }
            }

            const workers = [];
            const n = Math.min(Math.max(1, Math.floor(limit)), tasks.length);

            for (let i = 0; i < n; i++) workers.push(worker());

            await Promise.all(workers);
        },

        async waitBlockGap() {
            if (!this.lastBatchEnd) return;
            const gap = Date.now() - this.lastBatchEnd;
            const wait = Math.max(0, Number(settings.color.blockGapMs || 1000) - gap);
            if (wait > 0) await sleep(wait);
        },

        schedulePracticeContinue(delay) {
            clearTimeout(this.autoTimer);

            if (!settings.color.autoContinueBatch) return;
            if (!this.isPracticePage()) return;
            if (!settings.modules.color) return;

            this.autoTimer = setTimeout(() => {
                this.fetchNextPracticeBatch();
            }, Math.max(0, delay));
        },

        scheduleContestContinue(delay) {
            clearTimeout(this.contestTimer);

            if (!this.isContestPage()) return;
            if (!settings.modules.color) return;

            this.contestTimer = setTimeout(() => {
                this.renderContestPage();
            }, Math.max(0, delay));
        },

        async fetchNextPracticeBatch() {
            if (!settings.modules.color) return;

            if (this.practiceFetching) {
                this.schedulePracticeContinue(200);
                return;
            }

            const pidMap = this.getPracticePidMap();
            if (!pidMap) {
                this.schedulePracticeContinue(200);
                return;
            }

            this.colorByCache(pidMap);

            const missing = this.getMissingPids(pidMap);
            if (!missing.length) {
                clearTimeout(this.autoTimer);
                Toolbox.setStatus('练习页题目难度已全部染色');
                return;
            }

            const batch = missing.slice(0, Math.max(1, Math.floor(settings.color.batchSize || 60)));

            this.practiceFetching = true;
            let ok = 0;

            try {
                await this.waitBlockGap();

                const tasks = batch.map(pid => async () => {
                    try {
                        const diff = await ProblemDifficulty.fetchByPid(pid);
                        if (!validDiff(diff)) return;

                        const arr = pidMap.get(pid) || [];
                        let changed = false;

                        for (const a of arr) {
                            if (this.setColor(a, diff)) changed = true;
                        }

                        if (changed) ok++;
                    } catch (err) {
                        console.warn('[TDK Luogu Toolbox] color practice failed:', pid, err);
                    }
                });

                await this.runQueue(tasks, settings.color.concurrency || 4);

                this.colorByCache(pidMap);
                ProblemDifficulty.save();
                this.lastBatchEnd = Date.now();

                const left = this.getMissingPids(pidMap).length;

                if (!left) {
                    clearTimeout(this.autoTimer);
                    Toolbox.setStatus('练习页题目难度已全部染色');
                    return;
                }

                this.schedulePracticeContinue(ok === 0 ? settings.color.noProgressGapMs : settings.color.blockGapMs);
            } finally {
                this.practiceFetching = false;
            }
        },

        renderPracticePage() {
            if (!settings.modules.color) return;
            if (this.practiceRunning) return;

            const pidMap = this.getPracticePidMap();
            if (!pidMap) return;

            this.practiceRunning = true;

            try {
                this.colorByCache(pidMap);

                if (!this.practiceAutoDone) {
                    this.practiceAutoDone = true;

                    if (settings.color.autoFetchFirstBatch) {
                        this.schedulePracticeContinue(0);
                    }
                }
            } finally {
                this.practiceRunning = false;
            }
        },

        async renderContestPage() {
            if (!settings.modules.color) return;
            if (this.contestFetching) return;

            const pidMap = this.getContestPidMap();
            if (!pidMap) {
                this.scheduleContestContinue(300);
                return;
            }

            this.colorByCache(pidMap);

            const missing = this.getMissingPids(pidMap);
            if (!missing.length) {
                clearTimeout(this.contestTimer);
                return;
            }

            this.contestFetching = true;

            try {
                const tasks = missing.map(pid => async () => {
                    try {
                        const diff = await ProblemDifficulty.fetchByPid(pid);
                        if (!validDiff(diff)) return;

                        const arr = pidMap.get(pid) || [];
                        for (const el of arr) this.setColor(el, diff);
                    } catch (err) {
                        console.warn('[TDK Luogu Toolbox] color contest failed:', pid, err);
                    }
                });

                await this.runQueue(tasks, settings.color.concurrency || 4);

                this.colorByCache(pidMap);
                ProblemDifficulty.save();

                const left = this.getMissingPids(pidMap).length;
                if (left) this.scheduleContestContinue(settings.color.blockGapMs || 1000);
            } finally {
                this.contestFetching = false;
            }
        },

        render() {
            if (!settings.modules.color) return;

            clearTimeout(this.renderTimer);
            this.renderTimer = setTimeout(() => {
                if (this.isRecordPage()) this.renderRecordPage();
                if (this.isPracticePage()) this.renderPracticePage();
                if (this.isContestPage()) this.renderContestPage();
            }, 120);
        },

        clearRendered() {
            clearTimeout(this.renderTimer);
            clearTimeout(this.autoTimer);
            clearTimeout(this.contestTimer);
            this.practiceAutoDone = false;

            document.querySelectorAll('[data-tdk-diff-done="1"]').forEach(el => {
                el.style.color = '';
                el.style.fontWeight = '';
                delete el.dataset.tdkDiff;
                delete el.dataset.tdkDiffDone;
            });
        },

        init() {
            this.render();
            setTimeout(() => this.render(), 300);
            setTimeout(() => this.render(), 800);
            setTimeout(() => this.render(), 1500);

            if (window._feInstance && window._feInstance.$watch) {
                try {
                    window._feInstance.$watch('currentData.records.result', () => this.render());
                } catch (_) { }
            }

            const observer = new MutationObserver(() => this.render());
            observer.observe(document.body, {
                childList: true,
                subtree: true,
            });
        },
    };

    const RandomModule = {
        getPageCache() {
            return readJSON(KEY.randomPageCache, {});
        },

        savePageCache(cache) {
            writeJSON(KEY.randomPageCache, cache);
        },

        getBlacklist() {
            const list = readJSON(KEY.randomBlacklist, []);
            return Array.isArray(list) ? list : [];
        },

        saveBlacklist(list) {
            writeJSON(KEY.randomBlacklist, Array.from(new Set(list)));
        },

        addToBlacklist(pid) {
            if (!pid) return;
            const list = this.getBlacklist();
            if (!list.includes(pid)) {
                list.push(pid);
                this.saveBlacklist(list);
            }
        },

        removeFromBlacklist(pid) {
            this.saveBlacklist(this.getBlacklist().filter(x => x !== pid));
        },

        clearBlacklist() {
            this.saveBlacklist([]);
        },

        rand(l, r) {
            return Math.floor(Math.random() * (r - l + 1)) + l;
        },

        shuffle(a) {
            for (let i = a.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                const t = a[i];
                a[i] = a[j];
                a[j] = t;
            }
            return a;
        },

        sameArray(a, b) {
            if (!a || !b) return false;
            if (a.length !== b.length) return false;
            for (let i = 0; i < a.length; i++) {
                if (a[i] !== b[i]) return false;
            }
            return true;
        },

        buildListUrl(page, diff) {
            return BASE + '/problem/list?type=luogu&page=' + page + '&difficulty=' + diff;
        },

        getCacheEntry(diff) {
            const cache = this.getPageCache();
            const entry = cache[diff];
            const maxPageLimit = Number(settings.random.maxReasonablePage || 1000);

            if (!entry) return null;
            if (!Number.isInteger(entry.maxPage)) return null;
            if (!Number.isInteger(entry.pageSize)) return null;
            if (entry.maxPage <= 0 || entry.maxPage > maxPageLimit) return null;
            if (entry.pageSize <= 0) return null;

            return entry;
        },

        setCacheEntry(diff, maxPage, pageSize) {
            const cache = this.getPageCache();
            cache[diff] = {
                maxPage,
                pageSize,
                totalCount: maxPage * pageSize,
                updatedAt: Date.now(),
            };
            this.savePageCache(cache);
        },

        clearDifficultyCache(diff) {
            const cache = this.getPageCache();
            delete cache[diff];
            this.savePageCache(cache);
        },

        isExpired(entry) {
            const ttl = Math.max(1, Number(settings.random.cacheTtlDays || 7)) * 24 * 60 * 60 * 1000;
            return !entry.updatedAt || Date.now() - entry.updatedAt > ttl;
        },

        formatTime(ts) {
            return ts ? new Date(ts).toLocaleString() : '从未更新';
        },

        rowLooksAccepted(row) {
            if (!row) return false;

            const statusNode =
                row.querySelector('.status') ||
                row.querySelector('[class~="status"]') ||
                row.querySelector('[class*="status"]');

            if (!statusNode) return false;

            const html = statusNode.innerHTML || '';
            const text = statusNode.innerText || '';

            if (/fa-check/.test(html)) return true;
            if (/data-icon=["']check/.test(html)) return true;
            if (/lcolor--green/.test(html)) return true;
            if (/--green/.test(html)) return true;
            if (/rgb\(\s*82\s*,\s*196\s*,\s*26\s*\)/.test(html)) return true;
            if (/已通过|Accepted|\bAC\b/.test(text)) return true;

            return false;
        },

        findProblemRowFromAnchor(a) {
            let p = a;

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
        },

        parseProblemsFromDOM(doc, allowAC) {
            const map = new Map();
            const anchors = doc.querySelectorAll('a[href^="/problem/"],a[href^="https://www.luogu.com.cn/problem/"]');

            anchors.forEach(a => {
                const href = a.getAttribute('href') || '';
                let url;

                try {
                    url = new URL(href, BASE);
                } catch (_) {
                    return;
                }

                const match = url.pathname.match(/^\/problem\/([A-Za-z0-9_.-]+)$/);
                if (!match) return;

                const pid = match[1];
                if (!pid || !/^[A-Za-z0-9_.-]+$/.test(pid)) return;

                const row = this.findProblemRowFromAnchor(a);
                const accepted = this.rowLooksAccepted(row);

                if (!allowAC && accepted) return;

                if (!map.has(pid)) {
                    map.set(pid, { pid, accepted });
                }
            });

            return Array.from(map.values());
        },

        async fetchPageDoc(url) {
            return await RequestQueue.doc(url, requestOptions({
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }));
        },

        async fetchPageProblems(diff, page, allowAC) {
            const doc = await this.fetchPageDoc(this.buildListUrl(page, diff));
            return this.parseProblemsFromDOM(doc, allowAC);
        },

        problemsToPids(problems) {
            return problems.filter(item => item && item.pid).map(item => String(item.pid));
        },

        async getPagePidsForMaxDetect(diff, page) {
            return this.problemsToPids(await this.fetchPageProblems(diff, page, true));
        },

        async isOverflowPage(diff, page) {
            const cur = await this.getPagePidsForMaxDetect(diff, page);
            const nxt = await this.getPagePidsForMaxDetect(diff, page + 1);

            if (cur.length === 0) return true;
            if (nxt.length === 0) return true;

            return this.sameArray(cur, nxt);
        },

        async refreshMaxPage(diff) {
            Toolbox.setStatus('正在探测难度 ' + diff + ' 的最大页...');

            const oldEntry = this.getCacheEntry(diff);
            const firstProblems = await this.fetchPageProblems(diff, 1, true);
            const firstPids = this.problemsToPids(firstProblems);

            if (firstPids.length === 0) {
                throw new Error('第一页没有解析到题目，无法探测最大页');
            }

            const pageSize = firstPids.length;
            let l;
            let r;

            if (oldEntry && oldEntry.maxPage > 0) {
                Toolbox.setStatus('已有缓存最大页 ' + oldEntry.maxPage + '，从缓存附近开始刷新...');

                if (await this.isOverflowPage(diff, oldEntry.maxPage)) {
                    this.setCacheEntry(diff, oldEntry.maxPage, pageSize);
                    Toolbox.setStatus('最大页未变化：难度 ' + diff + '，最大页 ' + oldEntry.maxPage + '，每页 ' + pageSize + ' 题');
                    return oldEntry.maxPage;
                }

                l = oldEntry.maxPage;
                r = oldEntry.maxPage + 1;

                while (r <= Number(settings.random.maxReasonablePage || 1000)) {
                    Toolbox.setStatus('正在向后探测：检查第 ' + r + ' 页和第 ' + (r + 1) + ' 页...');

                    if (await this.isOverflowPage(diff, r)) break;

                    l = r;
                    r = r * 2;
                }
            } else {
                Toolbox.setStatus('第一次缓存该难度，从第一页开始指数探测...');

                if (await this.isOverflowPage(diff, 1)) {
                    this.setCacheEntry(diff, 1, pageSize);
                    Toolbox.setStatus('已缓存难度 ' + diff + '：最大页 1，每页 ' + pageSize + ' 题');
                    return 1;
                }

                l = 1;
                r = 2;

                while (r <= Number(settings.random.maxReasonablePage || 1000)) {
                    Toolbox.setStatus('正在指数探测：检查第 ' + r + ' 页和第 ' + (r + 1) + ' 页...');

                    if (await this.isOverflowPage(diff, r)) break;

                    l = r;
                    r = r * 2;
                }
            }

            const maxReasonablePage = Number(settings.random.maxReasonablePage || 1000);
            if (r > maxReasonablePage) r = maxReasonablePage;

            let ans = r;
            let left = l + 1;
            let right = r;

            while (left <= right) {
                const mid = Math.floor((left + right) / 2);
                Toolbox.setStatus('正在二分最大页：' + left + ' ~ ' + right + '，检查 ' + mid);

                if (await this.isOverflowPage(diff, mid)) {
                    ans = mid;
                    right = mid - 1;
                } else {
                    left = mid + 1;
                }
            }

            if (!Number.isInteger(ans) || ans <= 0 || ans > maxReasonablePage) {
                throw new Error('最大页数异常：maxPage=' + ans);
            }

            this.setCacheEntry(diff, ans, pageSize);
            Toolbox.setStatus('已缓存难度 ' + diff + '：最大页 ' + ans + '，每页 ' + pageSize + ' 题');
            return ans;
        },

        async getMaxPageWithCache(diff) {
            let entry = this.getCacheEntry(diff);

            if (!entry) {
                Toolbox.setStatus('当前难度尚未缓存页数，开始探测最大页...');
                await this.refreshMaxPage(diff);
                return this.getCacheEntry(diff);
            }

            if (this.isExpired(entry)) {
                Toolbox.setStatus('当前难度页数缓存已过期，开始自动刷新...');
                await this.refreshMaxPage(diff);
                return this.getCacheEntry(diff);
            }

            Toolbox.setStatus('读取缓存：最大页 ' + entry.maxPage + '；每页 ' + entry.pageSize + ' 题；上次更新：' + this.formatTime(entry.updatedAt));
            return entry;
        },

        async pickProblem(diff, allowAC) {
            const entry = await this.getMaxPageWithCache(diff);
            const blacklist = this.getBlacklist();
            const maxAttempt = Math.max(1, Math.floor(settings.random.maxRandomAttempt || 40));

            for (let attempt = 1; attempt <= maxAttempt; attempt++) {
                const page = this.rand(1, entry.maxPage);

                Toolbox.setStatus('随机第 ' + page + '/' + entry.maxPage + ' 页，第 ' + attempt + ' 次尝试...');

                const problems = await this.fetchPageProblems(diff, page, true);
                const candidates = problems.filter(item => {
                    if (!item || !item.pid) return false;

                    const pid = String(item.pid);
                    if (blacklist.includes(pid)) return false;
                    if (!allowAC && item.accepted) return false;

                    return true;
                }).map(item => String(item.pid));

                this.shuffle(candidates);

                if (candidates.length > 0) return candidates[0];
            }

            throw new Error('连续多次没有可抽题目，可能该难度题目大多已 AC 或被拉黑');
        },

        async randomProblem(diff = settings.random.difficulty, allowAC = settings.random.allowAC) {
            if (!settings.modules.random) {
                throw new Error('随机题模块已关闭');
            }

            settings.random.difficulty = String(diff);
            settings.random.allowAC = !!allowAC;
            settings = normalizeSettings(settings);
            writeJSON(KEY.settings, settings);

            const pid = await this.pickProblem(settings.random.difficulty, settings.random.allowAC);
            Toolbox.setStatus('抽中 ' + pid + '，正在打开...');

            if (settings.random.autoMinimize) Toolbox.setMinimized(true);
            location.href = buildProblemUrl(pid);
        },

        quickBlacklistCurrent() {
            const pid = currentProblemId();

            if (!pid) {
                Toolbox.setStatus('当前不是题目页，无法拉黑当前题目');
                return;
            }

            this.addToBlacklist(pid);
            Toolbox.renderBlacklistPanel();
            Toolbox.setStatus('已拉黑题目 ' + pid);
        },
    };

    const ChartModule = {
        CARD_ID: 'tdk-luogu-difficulty-chart',
        STYLE_ID: 'tdk-luogu-chart-style',
        HOME_WRAP_ID: 'tdk-luogu-difficulty-chart-wrap',
        renderLock: false,
        renderRevision: 0,
        pendingRender: false,
        pendingForce: false,

        getRecentTotal() {
            const x = Number(settings.chart.recentTotal || 50);
            return Math.min(settings.chart.maxRecentTotal, Math.max(settings.chart.minRecentTotal, Math.floor(Number.isFinite(x) ? x : 50)));
        },

        setRecentTotal(x) {
            settings.chart.recentTotal = Math.min(settings.chart.maxRecentTotal, Math.max(settings.chart.minRecentTotal, Math.floor(Number(x) || 50)));
            saveSettings({ refreshSettings: false, random: false });
            return settings.chart.recentTotal;
        },

        getPageKind() {
            if (location.pathname === '/') return 'home';
            if (/^\/user\/\d+\/practice\/?$/.test(location.pathname)) return 'practice';
            if (/^\/user\/\d+\/?$/.test(location.pathname)) return 'user';
            return 'other';
        },

        shouldRun() {
            if (!settings.modules.chart) return false;
            const kind = this.getPageKind();
            if (kind === 'home' && !settings.chart.replaceHomeSlider) return false;
            return kind !== 'other';
        },

        getUidFromUrl() {
            const m = location.pathname.match(/^\/user\/(\d+)/);
            return m ? m[1] : null;
        },

        getUidFromHomeDom() {
            const candidates = [
                'a.lg-fg-orange.lg-bold[href^="/user/"]',
                '.lg-punch-result a[href^="/user/"]',
                '#app-old a[href^="/user/"]',
                'a[href^="/user/"]',
            ];

            for (const sel of candidates) {
                const a = document.querySelector(sel);
                if (!a) continue;

                const href = a.getAttribute('href') || '';
                const m = href.match(/^\/user\/(\d+)/);
                if (m) return m[1];
            }

            return null;
        },

        async waitDomChange(timeout = 15000) {
            return new Promise(resolve => {
                const root = document.body || document.documentElement;

                if (!root) {
                    setTimeout(() => resolve(false), timeout);
                    return;
                }

                let done = false;
                let observer = null;

                function finish(ok) {
                    if (done) return;
                    done = true;
                    clearTimeout(timer);
                    if (observer) observer.disconnect();
                    resolve(ok);
                }

                const timer = setTimeout(() => finish(false), timeout);

                observer = new MutationObserver(() => finish(true));
                observer.observe(root, { childList: true, subtree: true });
            });
        },

        async waitUid(kind, timeout = 12000) {
            if (kind === 'user' || kind === 'practice') {
                const uid = this.getUidFromUrl();
                if (uid) return uid;
                throw new Error('URL 中没有找到 UID');
            }

            const start = Date.now();

            while (Date.now() - start < timeout) {
                const uid = this.getUidFromHomeDom();
                if (uid) return uid;

                await Promise.race([
                    sleep(400),
                    this.waitDomChange(1000),
                ]);
            }

            throw new Error('主页没有找到当前用户 UID');
        },

        getRecentCount(item) {
            return Array.isArray(item.recent) ? item.recent.length : 0;
        },

        getRecentSum(rows) {
            return rows.reduce((s, item) => s + this.getRecentCount(item), 0);
        },

        formatPercent(x) {
            if (!Number.isFinite(x) || x <= 0) return '0%';
            if (x < 10) return `${x.toFixed(1)}%`;
            return `${Math.round(x)}%`;
        },

        injectStyle() {
            if (document.getElementById(this.STYLE_ID)) return;

            const style = document.createElement('style');
            style.id = this.STYLE_ID;

            style.textContent = `
#${this.CARD_ID} {
    box-sizing: border-box;
    margin: 0 0 16px 0;
    padding: 18px 22px;
    border-radius: 6px;
    background: var(--lfe-color--main-bg, #fff);
}
#${this.CARD_ID}.tdk-home-card { margin: 0; min-height: 300px; padding: 16px 18px; }
#${this.CARD_ID}.tdk-practice-card, #${this.CARD_ID}.tdk-user-card { margin: 0 0 16px 0; }
#${this.CARD_ID} .tdk-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
#${this.CARD_ID} .tdk-title { margin: 0; font-size: 1.17em; font-weight: 700; color: #333; }
#${this.CARD_ID} .tdk-tools { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
#${this.CARD_ID} .tdk-btn { cursor: pointer; border: none; background: transparent; color: #3498db; font-size: 13px; line-height: 1.5; user-select: none; }
#${this.CARD_ID} .tdk-btn:hover { color: #2d8cc8; text-decoration: underline; }
#${this.CARD_ID} .tdk-recent-control { display: flex; align-items: center; gap: 4px; color: #888; font-size: 13px; white-space: nowrap; }
#${this.CARD_ID} .tdk-recent-input { width: 56px; height: 24px; box-sizing: border-box; padding: 2px 5px; border: 1px solid #ddd; border-radius: 4px; outline: none; color: #555; background: #fff; font-size: 13px; }
#${this.CARD_ID} .tdk-recent-input:focus { border-color: #3498db; }
#${this.CARD_ID} .tdk-summary { margin: -4px 0 12px 0; font-size: 13px; color: #888; }
#${this.CARD_ID} .tdk-difficulty-list { position: relative; border: 1px solid #e5e5e5; border-radius: 4px; overflow: hidden; background: #fff; }
#${this.CARD_ID} .tdk-row { position: relative; display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 12px; min-height: 35px; padding: 5px 10px; border-bottom: 1px solid #eee; box-sizing: border-box; overflow: hidden; cursor: default; }
#${this.CARD_ID} .tdk-row:last-child { border-bottom: none; }
#${this.CARD_ID} .tdk-row-bg { position: absolute; left: 0; top: 0; bottom: 0; width: 0; opacity: .18; transition: width .35s ease; z-index: 0; }
#${this.CARD_ID} .tdk-row::after { content: ""; position: absolute; left: var(--tdk-percent, 0%); top: 0; bottom: 0; width: 1px; background: rgba(0,0,0,.035); z-index: 0; }
#${this.CARD_ID} .tdk-label-wrap, #${this.CARD_ID} .tdk-count { position: relative; z-index: 3; }
#${this.CARD_ID} .tdk-tag { display: inline-block; width: fit-content; max-width: 180px; padding: 2px 9px; border-radius: 3px; border: 1px solid transparent; color: #fff; font-size: 14px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-sizing: border-box; }
#${this.CARD_ID} .tdk-tag-unrated { color: #111; }
#${this.CARD_ID} .tdk-count { display: flex; align-items: baseline; justify-content: flex-end; gap: 7px; text-align: right; color: #444; font-size: 15px; font-variant-numeric: tabular-nums; white-space: nowrap; }
#${this.CARD_ID} .tdk-count-recent { color: #3498db; font-size: 12px; font-weight: 700; }
#${this.CARD_ID} .tdk-recent-line { position: absolute; left: 0; top: 0; width: 100%; height: 100%; z-index: 2; pointer-events: none; overflow: visible; }
#${this.CARD_ID} .tdk-recent-path { fill: none; stroke: #3498db; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; opacity: .9; filter: drop-shadow(0 1px 2px rgba(52, 152, 219, .35)); }
#${this.CARD_ID} .tdk-recent-dot { fill: #fff; stroke: #3498db; stroke-width: 2; }
#${this.CARD_ID} .tdk-caption { margin-top: 12px; font-size: 13px; color: #b5b5b5; }
#${this.CARD_ID} .tdk-error { color: #fe4c61; font-size: 13px; line-height: 1.7; }
#${this.CARD_ID} .tdk-tooltip { position: fixed; display: none; z-index: 2147483647; min-width: 250px; max-width: 390px; padding: 10px 12px; border-radius: 6px; background: #fff; color: #333; box-shadow: 0 4px 18px rgba(0,0,0,.18); border: 1px solid #e5e5e5; font-size: 13px; line-height: 1.55; pointer-events: auto; }
#${this.CARD_ID} .tdk-tooltip-title { margin-bottom: 6px; font-weight: 700; color: #555; }
#${this.CARD_ID} .tdk-tooltip-empty { color: #999; }
#${this.CARD_ID} .tdk-tooltip-item { display: block; color: #3498db; text-decoration: none; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; cursor: pointer; }
#${this.CARD_ID} .tdk-tooltip-item:hover { color: #2d8cc8; text-decoration: underline; }
#${this.CARD_ID} .tdk-tooltip-pid { color: #999; margin-right: 4px; }
#${this.HOME_WRAP_ID} { box-sizing: border-box; }
#${this.CARD_ID}.tdk-home-card .tdk-title { font-size: 18px; }
#${this.CARD_ID}.tdk-home-card .tdk-row { min-height: 34px; padding: 5px 10px; }
#${this.CARD_ID}.tdk-home-card .tdk-tag { max-width: 128px; padding: 1px 7px; font-size: 13px; }
#${this.CARD_ID}.tdk-home-card .tdk-count { gap: 4px; font-size: 13px; }
#${this.CARD_ID}.tdk-home-card .tdk-count-recent { font-size: 11px; }
            `;

            document.head.appendChild(style);
        },

        removeOld() {
            this.renderRevision++;

            const old = document.getElementById(this.CARD_ID);
            if (old) {
                if (old.__tdkResizeHandler) window.removeEventListener('resize', old.__tdkResizeHandler);
                old.remove();
            }

            const wrap = document.getElementById(this.HOME_WRAP_ID);
            if (wrap && !wrap.querySelector(`#${this.CARD_ID}`)) wrap.remove();

            document.querySelectorAll('[data-tdk-chart-hidden="1"]').forEach(node => {
                node.style.display = node.dataset.tdkChartDisplay || '';
                delete node.dataset.tdkChartHidden;
                delete node.dataset.tdkChartDisplay;
            });
        },

        isStaleRender(revision, href) {
            return revision !== this.renderRevision || href !== location.href;
        },

        findCardByTitle(title, root = document) {
            const cards = Array.from(root.querySelectorAll('.l-card'));
            return cards.find(card => {
                const h3 = card.querySelector('h3');
                return h3 && h3.textContent.trim() === title;
            });
        },

        findDifficultyCard(root = document) {
            const cards = Array.from(root.querySelectorAll('.l-card'));
            return cards.find(card => {
                const h3 = card.querySelector('h3');
                return h3 && h3.textContent.trim() === '难易度统计' && card.querySelector('.difficulty-tags');
            });
        },

        findHomeReplaceTarget() {
            const slider = document.querySelector('#lg-slider');
            if (!slider) return null;
            return slider.closest('.am-u-md-8') || slider;
        },

        getInsertTarget(kind) {
            if (kind === 'home') {
                const node = this.findHomeReplaceTarget();
                if (!node) return null;
                return { mode: 'replace', node };
            }

            if (kind === 'practice') {
                const node = this.findDifficultyCard(document);
                if (!node) return null;
                return { mode: 'replace', node };
            }

            if (kind === 'user') {
                const node = this.findCardByTitle('做题趋势热度图', document);
                if (!node) return null;
                return { mode: 'before', node };
            }

            return null;
        },

        async waitInsertTarget(kind, timeout = 20000) {
            const start = Date.now();

            while (Date.now() - start < timeout) {
                const target = this.getInsertTarget(kind);
                if (target) return target;

                await Promise.race([
                    sleep(500),
                    this.waitDomChange(1000),
                ]);
            }

            return null;
        },

        async ensureCard(kind) {
            this.injectStyle();

            const old = document.getElementById(this.CARD_ID);
            if (old) return old;

            const target = await this.waitInsertTarget(kind);
            if (!target) throw new Error('没有找到指定插入位置');

            const card = document.createElement('div');
            card.id = this.CARD_ID;
            card.className = 'l-card';
            if (kind === 'home') card.classList.add('tdk-home-card');
            if (kind === 'practice') card.classList.add('tdk-practice-card');
            if (kind === 'user') card.classList.add('tdk-user-card');

            if (target.mode === 'replace') {
                target.node.dataset.tdkChartHidden = '1';
                target.node.dataset.tdkChartDisplay = target.node.style.display || '';
                target.node.style.display = 'none';

                if (kind === 'home') {
                    const wrapper = document.createElement('div');
                    wrapper.className = target.node.className || 'am-u-md-8';
                    wrapper.id = this.HOME_WRAP_ID;
                    wrapper.appendChild(card);
                    target.node.before(wrapper);
                } else {
                    target.node.before(card);
                }
            } else if (target.mode === 'before') {
                target.node.before(card);
            } else {
                target.node.prepend(card);
            }

            return card;
        },

        parseCurrentPageDifficulty() {
            const card = this.findDifficultyCard(document);
            if (!card) return [];

            const rows = Array.from(card.querySelectorAll('.difficulty-tags .row'));

            return rows.map(row => {
                const tag = Array.from(row.querySelectorAll('span')).find(x => !x.classList.contains('problem-count'));
                const cnt = row.querySelector('.problem-count');
                if (!tag || !cnt) return null;

                const name = tag.textContent.trim();
                const m = cnt.textContent.trim().match(/\d+/);
                if (!name || !m) return null;

                const meta = DIFFICULTIES.find(x => x.name === name);

                return {
                    id: meta?.id ?? 0,
                    name,
                    count: Number(m[0]),
                    color: tag.style.backgroundColor || meta?.color || '#66ccff',
                    recent: [],
                };
            }).filter(Boolean);
        },

        async waitCurrentPageDifficulty(timeout = 10000) {
            const start = Date.now();

            while (Date.now() - start < timeout) {
                const rows = this.parseCurrentPageDifficulty();
                if (rows.length) return rows;
                await sleep(300);
            }

            return [];
        },

        getDifficultyId(x) {
            if (x === null || x === undefined) return 0;
            x = Number(x);
            if (!Number.isFinite(x) || x < 0 || x > 7) return 0;
            return x;
        },

        getProblemPid(problem) {
            if (!problem || typeof problem !== 'object') return '';

            const candidates = [
                problem.pid,
                problem.problemId,
                problem.problem_id,
                problem.problem?.pid,
                problem.problem?.problemId,
                problem.problem?.problem_id,
            ];

            for (const x of candidates) {
                if (typeof x !== 'string') continue;
                const pid = x.trim();
                if (/^(P|B|CF|AT|SP|UVA|HDU|POJ|SPOJ|CodeForces|Gym)[A-Za-z0-9_./-]+$/i.test(pid)) return pid;
            }

            return '';
        },

        getProblemTitle(problem) {
            if (!problem || typeof problem !== 'object') return '';
            return problem.title || problem.name || problem.fullname || problem.problem?.title || problem.problem?.name || problem.problem?.fullname || '';
        },

        getProblemDifficulty(problem) {
            if (!problem || typeof problem !== 'object') return 0;
            return problem.difficulty ?? problem.problem?.difficulty ?? problem.problemInfo?.difficulty ?? problem.problemData?.difficulty ?? 0;
        },

        findPassedArray(obj, depth = 0) {
            if (!obj || depth > 8) return null;
            if (Array.isArray(obj.passed)) return obj.passed;
            if (Array.isArray(obj)) return null;

            for (const key of Object.keys(obj)) {
                const res = this.findPassedArray(obj[key], depth + 1);
                if (res) return res;
            }

            return null;
        },

        countPassedArray(passed) {
            const cnt = new Map();

            for (const item of DIFFICULTIES) cnt.set(item.id, 0);

            for (const problem of passed) {
                const id = this.getDifficultyId(this.getProblemDifficulty(problem));
                cnt.set(id, (cnt.get(id) || 0) + 1);
            }

            return DIFFICULTIES.map(item => ({
                ...item,
                count: cnt.get(item.id) || 0,
                recent: [],
            }));
        },

        isProblemLike(x) {
            if (!x || typeof x !== 'object') return false;
            return !!(x.problem || x.problemInfo || x.problemData || x.problemsetProblem || x.pid || x.problemId || x.problem_id);
        },

        findRecordArray(obj, depth = 0) {
            if (!obj || depth > 8) return null;

            if (Array.isArray(obj)) {
                const ok = obj.some(x => x && typeof x === 'object' && (
                    this.isProblemLike(x.problem) ||
                    this.isProblemLike(x.problemInfo) ||
                    this.isProblemLike(x.problemData) ||
                    this.isProblemLike(x.problemsetProblem) ||
                    this.isProblemLike(x)
                ));

                return ok ? obj : null;
            }

            const preferredKeys = ['records', 'submissions', 'result', 'results', 'items', 'list', 'data', 'currentData'];

            for (const key of preferredKeys) {
                if (!(key in obj)) continue;
                const res = this.findRecordArray(obj[key], depth + 1);
                if (res) return res;
            }

            for (const key of Object.keys(obj)) {
                if (preferredKeys.includes(key)) continue;
                const res = this.findRecordArray(obj[key], depth + 1);
                if (res) return res;
            }

            return null;
        },

        getRecordProblem(record) {
            if (!record || typeof record !== 'object') return {};
            return record.problem || record.problemInfo || record.problemData || record.problemsetProblem || record;
        },

        getRecordTime(record) {
            if (!record || typeof record !== 'object') return 0;

            const candidates = [record.submitTime, record.createTime, record.time, record.submit_time, record.createdAt, record.created_at, record.submitAt, record.submit_at];

            for (const x of candidates) {
                const y = Number(x);
                if (Number.isFinite(y) && y > 0) return y;
            }

            return 0;
        },

        getRecordStatus(record) {
            if (!record || typeof record !== 'object') return null;

            const candidates = [record.status, record.result, record.judgeStatus, record.statusType];

            for (const x of candidates) {
                if (x === null || x === undefined) continue;

                if (typeof x === 'number') return x;

                if (typeof x === 'string') {
                    const y = Number(x);
                    if (Number.isFinite(y)) return y;

                    const s = x.toLowerCase();
                    if (s === 'accepted' || s === 'ac') return 12;
                }

                if (typeof x === 'object') {
                    if (typeof x.id === 'number') return x.id;
                    if (typeof x.value === 'number') return x.value;
                }
            }

            return null;
        },

        isAcceptedRecord(record) {
            const status = this.getRecordStatus(record);
            if (status === null) return true;
            return status === 12;
        },

        getRecordProblemDifficulty(record) {
            const problem = this.getRecordProblem(record);
            const x = problem.difficulty ?? record?.difficulty ?? problem.problem?.difficulty ?? null;
            if (x === null || x === undefined) return null;

            const id = Number(x);
            if (!Number.isFinite(id) || id < 0 || id > 7) return null;
            return id;
        },

        async fetchRecentRecords(uid, uniqueLimit) {
            const records = [];
            const seen = new Set();
            const pageLimit = Math.max(1, Math.floor(settings.chart.recordPageLimit || 20));

            for (let page = 1; page <= pageLimit; page++) {
                const url = `/record/list?user=${encodeURIComponent(uid)}&status=12&page=${page}`;
                const json = await RequestQueue.json(url, requestOptions());
                const arr = this.findRecordArray(json);
                if (!arr || !arr.length) break;

                const list = arr.map((record, idx) => ({ record, idx, time: this.getRecordTime(record) }));

                if (list.some(x => x.time > 0)) {
                    list.sort((a, b) => {
                        if (a.time !== b.time) return b.time - a.time;
                        return a.idx - b.idx;
                    });
                }

                for (const item of list) {
                    const record = item.record;
                    if (!this.isAcceptedRecord(record)) continue;

                    const problem = this.getRecordProblem(record);
                    const pid = this.getProblemPid(problem) || this.getProblemPid(record);
                    const difficulty = this.getRecordProblemDifficulty(record);

                    if (!pid) continue;
                    if (difficulty === null) continue;
                    if (seen.has(pid)) continue;

                    seen.add(pid);
                    records.push(record);

                    if (records.length >= uniqueLimit) return records;
                }
            }

            return records;
        },

        async fetchRecentByDifficulty(uid, uniqueLimit) {
            const records = await this.fetchRecentRecords(uid, uniqueLimit);
            const recent = new Map();

            for (const item of DIFFICULTIES) recent.set(item.id, []);

            for (const record of records) {
                const problem = this.getRecordProblem(record);
                const pid = this.getProblemPid(problem) || this.getProblemPid(record);
                if (!pid) continue;

                const id = this.getRecordProblemDifficulty(record);
                if (id === null) continue;

                const arr = recent.get(id);
                if (!arr) continue;

                arr.push({
                    pid,
                    title: this.getProblemTitle(problem) || this.getProblemTitle(record) || pid,
                });
            }

            return recent;
        },

        async fetchPracticeRows(uid) {
            const json = await RequestQueue.json(`/user/${uid}/practice?_contentOnly=1&_=${Date.now()}`, requestOptions());
            const passed = this.findPassedArray(json);

            if (!passed) {
                throw new Error('JSON 中没有找到 passed 数组');
            }

            const rows = this.countPassedArray(passed);

            try {
                const recentTotal = this.getRecentTotal();
                const recent = await this.fetchRecentByDifficulty(uid, recentTotal);

                for (const row of rows) row.recent = recent.get(row.id) || [];
            } catch (err) {
                console.warn('[TDK Luogu Toolbox] recent record failed:', err);
            }

            return rows;
        },

        async getRows(uid, kind) {
            try {
                return await this.fetchPracticeRows(uid);
            } catch (err) {
                console.warn('[TDK Luogu Toolbox] fetch practice rows failed:', err);
            }

            if (kind === 'practice') {
                const rows = await this.waitCurrentPageDifficulty();
                if (rows.length) return rows;
            }

            throw new Error('没有读取到难度统计数据');
        },

        async renderLoading(uid, kind) {
            const card = await this.ensureCard(kind);
            card.innerHTML = `
<div class="tdk-head">
    <h3 class="tdk-title">难易度统计</h3>
</div>
<div class="tdk-summary">正在读取 UID ${escapeHtml(uid)} 的练习数据……</div>
            `;
        },

        async renderError(uid, kind, err) {
            const card = await this.ensureCard(kind);
            card.innerHTML = `
<div class="tdk-head">
    <h3 class="tdk-title">难易度统计</h3>
    <div class="tdk-tools"><span class="tdk-btn" data-action="refresh">重试</span></div>
</div>
<div class="tdk-error">
    读取失败。<br>
    ${uid ? `UID：${escapeHtml(uid)}<br>` : ''}
    错误：${escapeHtml(String(err && err.message ? err.message : err))}
</div>
            `;

            card.querySelector('[data-action="refresh"]').onclick = () => this.render(true);
        },

        async renderChart(uid, kind, rows) {
            const card = await this.ensureCard(kind);

            if (card.__tdkResizeHandler) {
                window.removeEventListener('resize', card.__tdkResizeHandler);
                card.__tdkResizeHandler = null;
            }

            const total = rows.reduce((s, x) => s + x.count, 0);
            const maxCount = Math.max(1, ...rows.map(x => x.count));
            const recentTarget = this.getRecentTotal();
            const recentSum = this.getRecentSum(rows);

            card.innerHTML = `
<div class="tdk-head">
    <h3 class="tdk-title lfe-h3">难易度统计</h3>
    <div class="tdk-tools">
        <label class="tdk-recent-control">最近通过 <input class="tdk-recent-input" type="number" min="${settings.chart.minRecentTotal}" max="${settings.chart.maxRecentTotal}" value="${recentTarget}"> 题</label>
        <span class="tdk-btn" data-action="refresh">刷新</span>
    </div>
</div>
<div class="tdk-summary lfe-caption">UID：${escapeHtml(uid)}，通过 ${total} 题；近期样本 ${recentSum}/${recentTarget} 题，折线表示近期通过比例。</div>
<div class="tdk-difficulty-list"></div>
<div class="tdk-tooltip"></div>
            `;

            const box = card.querySelector('.tdk-difficulty-list');
            const tooltip = card.querySelector('.tdk-tooltip');
            const input = card.querySelector('.tdk-recent-input');
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

            svg.classList.add('tdk-recent-line');
            box.appendChild(svg);

            let hideTimer = null;

            input.addEventListener('change', () => {
                input.value = this.setRecentTotal(input.value);
                this.render(true);
            });

            input.addEventListener('blur', () => {
                input.value = this.setRecentTotal(input.value);
            });

            tooltip.addEventListener('mouseenter', () => clearTimeout(hideTimer));
            tooltip.addEventListener('mouseleave', () => hideTooltip());

            const drawRecentLine = () => {
                const width = box.clientWidth;
                const height = box.clientHeight;
                const rowNodes = Array.from(box.querySelectorAll('.tdk-row'));

                if (!width || !height || !rowNodes.length) return;

                const base = Math.max(1, this.getRecentSum(rows));
                const padX = 8;
                const usableWidth = Math.max(1, width - padX * 2);
                const boxRect = box.getBoundingClientRect();

                const points = rows.map((item, i) => {
                    const row = rowNodes[i];
                    const rect = row.getBoundingClientRect();
                    const cnt = this.getRecentCount(item);
                    const rate = cnt / base * 100;

                    return {
                        x: padX + usableWidth * Math.max(0, Math.min(1, cnt / base)),
                        y: rect.top - boxRect.top + rect.height / 2,
                        count: cnt,
                        rate,
                    };
                });

                const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
                const dots = points.map(p => `
<circle class="tdk-recent-dot" cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="4">
    <title>近期 ${p.count} 题，占 ${this.formatPercent(p.rate)}</title>
</circle>`).join('');

                svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
                svg.innerHTML = `<path class="tdk-recent-path" d="${path}"></path>${dots}`;
            };

            const hideTooltip = () => {
                clearTimeout(hideTimer);
                tooltip.style.display = 'none';
            };

            const placeTooltip = row => {
                const gap = 10;
                const rect = row.getBoundingClientRect();

                tooltip.style.left = '0px';
                tooltip.style.top = '0px';

                const tip = tooltip.getBoundingClientRect();
                let x = rect.right + gap;
                let y = rect.top + rect.height / 2 - tip.height / 2;

                if (x + tip.width > window.innerWidth - 8) x = rect.left - tip.width - gap;
                if (y + tip.height > window.innerHeight - 8) y = window.innerHeight - tip.height - 8;
                if (y < 8) y = 8;

                tooltip.style.left = `${Math.max(8, x)}px`;
                tooltip.style.top = `${Math.max(8, y)}px`;
            };

            const showTooltip = (row, item) => {
                clearTimeout(hideTimer);

                const list = item.recent || [];
                const base = Math.max(1, this.getRecentSum(rows));
                const rate = list.length / base * 100;

                let html = `<div class="tdk-tooltip-title">${escapeHtml(item.name)}：近期 ${list.length} 道，占 ${this.formatPercent(rate)}</div>`;

                if (!list.length) {
                    html += `<div class="tdk-tooltip-empty">暂无该难度最近 AC 记录</div>`;
                } else {
                    for (const problem of list) {
                        const pid = problem.pid || '';
                        const title = problem.title || pid || '未知题目';

                        if (pid) {
                            html += `
<a class="tdk-tooltip-item" href="/problem/${escapeHtml(pid)}" target="_blank" rel="noopener noreferrer">
    <span class="tdk-tooltip-pid">${escapeHtml(pid)}</span>${escapeHtml(title)}
</a>`;
                        } else {
                            html += `<div class="tdk-tooltip-item">${escapeHtml(title)}</div>`;
                        }
                    }
                }

                tooltip.innerHTML = html;
                tooltip.style.display = 'block';
                placeTooltip(row);
            };

            const delayHideTooltip = () => {
                clearTimeout(hideTimer);
                hideTimer = setTimeout(() => hideTooltip(), 350);
            };

            for (const item of rows) {
                const percent = item.count === 0 ? 0 : item.count / maxCount * 100;
                const recentCount = this.getRecentCount(item);
                const row = document.createElement('div');
                row.className = 'tdk-row';
                row.style.setProperty('--tdk-percent', `${percent}%`);

                const tagClass = item.id === 0 || item.name === '暂无评定' ? 'tdk-tag tdk-tag-unrated' : 'tdk-tag';

                row.innerHTML = `
<div class="tdk-row-bg"></div>
<div class="tdk-label-wrap"><span class="${tagClass}">${escapeHtml(item.name)}</span></div>
<div class="tdk-count"><span class="tdk-count-main">${item.count}题</span><span class="tdk-count-recent">近${recentCount}</span></div>
                `;

                const bg = row.querySelector('.tdk-row-bg');
                bg.style.backgroundColor = item.color;

                const tag = row.querySelector('.tdk-tag');
                tag.style.backgroundColor = item.color;
                tag.style.borderColor = item.color;

                row.addEventListener('mouseenter', () => showTooltip(row, item));
                row.addEventListener('mouseleave', delayHideTooltip);

                box.insertBefore(row, svg);

                requestAnimationFrame(() => {
                    bg.style.width = `${percent}%`;
                });
            }

            requestAnimationFrame(drawRecentLine);

            card.__tdkResizeHandler = () => drawRecentLine();
            window.addEventListener('resize', card.__tdkResizeHandler);

            card.querySelector('[data-action="refresh"]').onclick = () => this.render(true);
        },

        async render(force = false) {
            if (this.renderLock) {
                this.pendingRender = true;
                this.pendingForce = this.pendingForce || force;
                return;
            }

            if (!this.shouldRun()) {
                this.removeOld();
                return;
            }

            if (!force && document.getElementById(this.CARD_ID)) return;

            this.renderLock = true;
            const revision = ++this.renderRevision;
            const href = location.href;

            const kind = this.getPageKind();
            let uid = null;

            try {
                uid = await this.waitUid(kind);
                if (this.isStaleRender(revision, href)) return;

                if (kind !== 'practice') await this.renderLoading(uid, kind);
                if (this.isStaleRender(revision, href)) return;

                const rows = await this.getRows(uid, kind);
                if (this.isStaleRender(revision, href)) return;

                await this.renderChart(uid, kind, rows);
            } catch (err) {
                if (this.isStaleRender(revision, href)) return;

                console.error('[TDK Luogu Toolbox] chart:', err);
                try {
                    await this.renderError(uid, kind, err);
                } catch (e) {
                    console.warn('[TDK Luogu Toolbox] render error card failed:', e);
                    setTimeout(() => this.render(true), 1000);
                }
            } finally {
                this.renderLock = false;

                if (this.pendingRender) {
                    const nextForce = this.pendingForce;
                    this.pendingRender = false;
                    this.pendingForce = false;
                    setTimeout(() => this.render(nextForce), 0);
                }
            }
        },
    };

    const Toolbox = {
        activeTab: 'random',

        getUIState() {
            return readJSON(KEY.ui, {});
        },

        saveUIState(box) {
            const old = this.getUIState();
            const ui = {
                left: old.left || '',
                top: old.top || '',
                right: old.right || '',
                bottom: old.bottom || '',
                width: old.width || '',
                height: old.height || '',
                fontSize: old.fontSize || 14,
                minimized: old.minimized === true,
                activeTab: this.activeTab,
            };

            if (box && box.style) {
                ui.left = box.style.left || ui.left;
                ui.top = box.style.top || ui.top;
                ui.right = box.style.right || ui.right;
                ui.bottom = box.style.bottom || ui.bottom;

                if (!box.classList.contains('tdk-minimized')) {
                    ui.width = box.style.width || box.getBoundingClientRect().width + 'px';
                    ui.height = box.style.height || box.getBoundingClientRect().height + 'px';
                }

                const fs = box.style.getPropertyValue('--tdk-font-size');
                if (fs) ui.fontSize = Number(fs.replace('px', '')) || ui.fontSize;
            }

            writeJSON(KEY.ui, ui);
        },

        restoreUI(box) {
            const ui = this.getUIState();
            this.activeTab = ui.activeTab || 'random';

            if (ui.left && ui.top) {
                box.style.left = ui.left;
                box.style.top = ui.top;
                box.style.right = 'auto';
                box.style.bottom = 'auto';
            }

            if (ui.width) box.style.width = ui.width;
            if (ui.height) box.style.height = ui.height;

            if (ui.fontSize) box.style.setProperty('--tdk-font-size', Number(ui.fontSize) + 'px');
        },

        applyFontSize(size) {
            size = Math.max(11, Math.min(22, Number(size) || 14));
            const box = document.getElementById('tdk-lg-box');
            if (!box) return;

            box.style.setProperty('--tdk-font-size', size + 'px');

            const ui = this.getUIState();
            ui.fontSize = size;
            writeJSON(KEY.ui, ui);
        },

        injectStyle() {
            if (document.getElementById('tdk-lg-toolbox-style')) return;

            const style = document.createElement('style');
            style.id = 'tdk-lg-toolbox-style';
            style.textContent = `
#tdk-lg-box { position: fixed; right: 20px; bottom: 20px; z-index: 999999; width: 380px; min-width: 300px; min-height: 260px; max-width: 760px; max-height: 86vh; background: rgba(255,255,255,.96); border: 1px solid rgba(0,0,0,.08); border-radius: 16px; box-shadow: 0 12px 36px rgba(0,0,0,.18); padding: 14px; font-family: "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif; color: #222; overflow: auto; resize: both; font-size: var(--tdk-font-size, 14px); backdrop-filter: blur(10px); }
#tdk-lg-box * { box-sizing: border-box; }
#tdk-lg-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; cursor: move; user-select: none; }
#tdk-lg-title { font-size: 1.18em; font-weight: 900; line-height: 1.2; }
#tdk-lg-tools { display: flex; gap: 6px; flex-shrink: 0; }
.tdk-lg-mini-btn { width: 31px; height: 28px; border: none; border-radius: 9px; background: #f2f3f5; color: #333; font-size: .88em; font-weight: 800; cursor: pointer; }
.tdk-lg-mini-btn:hover { background: #e4e6eb; }
#tdk-lg-tabs { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 6px; margin-bottom: 10px; }
.tdk-lg-tab { height: 31px; border: 1px solid rgba(0,0,0,.08); border-radius: 10px; background: #f8f9fb; color: #444; font-weight: 800; cursor: pointer; }
.tdk-lg-tab.active { background: #3498db; color: #fff; border-color: #3498db; }
.tdk-lg-panel { display: none; }
.tdk-lg-panel.active { display: block; }
.tdk-lg-desc { color: #777; font-size: .9em; line-height: 1.5; margin: 0 0 10px 0; }
#tdk-lg-diff-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; margin-bottom: 10px; }
.tdk-lg-diff-btn { min-height: 34px; border-radius: 10px; border: 1px solid rgba(0,0,0,.08); background: #f8f9fb; font-weight: 800; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; padding: 0 8px; transition: transform .12s ease, box-shadow .12s ease, background .12s ease; }
.tdk-lg-diff-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,.10); }
.tdk-lg-diff-btn.active { color: #fff!important; box-shadow: 0 6px 16px rgba(0,0,0,.18); }
.tdk-lg-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 8px 0 10px; padding: 8px 10px; border-radius: 12px; background: #f7f8fa; }
.tdk-lg-row label { font-size: .94em; font-weight: 650; cursor: pointer; user-select: none; }
.tdk-lg-switch { width: 42px; height: 22px; appearance: none; border-radius: 999px; background: #c9ced6; position: relative; cursor: pointer; outline: none; transition: background .15s ease; }
.tdk-lg-switch:before { content: ""; position: absolute; width: 18px; height: 18px; left: 2px; top: 2px; border-radius: 50%; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,.25); transition: transform .15s ease; }
.tdk-lg-switch:checked { background: #3498db; }
.tdk-lg-switch:checked:before { transform: translateX(20px); }
.tdk-lg-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.tdk-lg-btn { height: 36px; border: none; border-radius: 11px; color: #fff; background: #3498db; font-weight: 800; cursor: pointer; transition: opacity .12s ease, transform .12s ease; font-size: 1em; }
.tdk-lg-btn:hover { opacity: .88; transform: translateY(-1px); }
.tdk-lg-btn:disabled { opacity: .55; cursor: not-allowed; transform: none; }
.tdk-lg-diff-btn:disabled, .tdk-lg-switch:disabled, #tdk-lg-mini-diff:disabled, #tdk-lg-mini-black:disabled { opacity: .55; cursor: not-allowed; transform: none; }
.tdk-lg-btn.main { grid-column: span 2; height: 40px; font-size: 1.05em; }
.tdk-lg-btn.orange { background: #e67e22; }
.tdk-lg-btn.red { background: #c0392b; }
.tdk-lg-btn.purple { background: #8e44ad; }
.tdk-lg-btn.gray { background: #6c757d; }
#tdk-lg-status { margin-top: 10px; padding: 8px 10px; border-radius: 10px; background: #f7f8fa; color: #666; font-size: .86em; line-height: 1.45; word-break: break-word; }
#tdk-lg-request { margin-top: 7px; color: #999; font-size: .82em; }
#tdk-lg-blacklist { display: none; margin-top: 10px; padding: 8px; border-radius: 12px; background: #f7f8fa; max-height: 160px; overflow: auto; }
#tdk-lg-blacklist.show { display: block; }
.tdk-lg-black-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 6px 8px; border-radius: 9px; background: #fff; margin-bottom: 6px; box-shadow: 0 1px 4px rgba(0,0,0,.05); }
.tdk-lg-black-item a { color: #3498db; font-weight: 800; text-decoration: none; }
.tdk-lg-black-item button { width: 48px; height: 26px; border: none; border-radius: 8px; background: #e74c3c; color: #fff; font-weight: 800; cursor: pointer; }
.tdk-setting-section { margin: 8px 0 12px; padding: 10px; border-radius: 12px; background: #f7f8fa; }
.tdk-setting-section h4 { margin: 0 0 8px; font-size: .98em; }
.tdk-setting-item { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; padding: 6px 0; color: #555; }
.tdk-setting-item + .tdk-setting-item { border-top: 1px solid rgba(0,0,0,.06); }
.tdk-setting-item input[type="number"], .tdk-setting-item select { width: 100px; height: 28px; border: 1px solid #ddd; border-radius: 8px; padding: 2px 6px; background: #fff; }
.tdk-setting-help { margin-top: 8px; color: #999; font-size: .82em; line-height: 1.5; }
#tdk-lg-resize-hint { position: absolute; right: 7px; bottom: 4px; color: #aaa; font-size: 12px; pointer-events: none; }
#tdk-lg-mini-panel { display: none; align-items: center; gap: 6px; }
#tdk-lg-mini-diff { height: 34px; min-width: 120px; border: none; border-radius: 999px; padding: 0 14px; font-weight: 800; color: #fff; cursor: pointer; white-space: nowrap; }
#tdk-lg-mini-black, #tdk-lg-mini-expand { width: 30px; height: 30px; border: none; border-radius: 999px; color: #fff; font-weight: 800; cursor: pointer; }
#tdk-lg-mini-black { background: #c0392b; }
#tdk-lg-mini-expand { background: #6c757d; }
#tdk-lg-box.tdk-minimized { width: auto!important; min-width: 0!important; min-height: 0!important; height: auto!important; resize: none!important; overflow: visible!important; padding: 8px 10px; border-radius: 999px; cursor: move; }
#tdk-lg-box.tdk-minimized #tdk-lg-full-panel { display: none; }
#tdk-lg-box.tdk-minimized #tdk-lg-mini-panel { display: flex; }
            `;

            document.head.appendChild(style);
        },

        createUI() {
            if (document.getElementById('tdk-lg-box')) return;

            this.injectStyle();

            const box = document.createElement('div');
            box.id = 'tdk-lg-box';

            const miniPanel = document.createElement('div');
            miniPanel.id = 'tdk-lg-mini-panel';

            const miniDiff = document.createElement('button');
            miniDiff.id = 'tdk-lg-mini-diff';
            miniDiff.title = '点击继续随机当前难度';

            const miniBlack = document.createElement('button');
            miniBlack.id = 'tdk-lg-mini-black';
            miniBlack.textContent = '×';
            miniBlack.title = '拉黑当前题目';

            const miniExpand = document.createElement('button');
            miniExpand.id = 'tdk-lg-mini-expand';
            miniExpand.textContent = '↗';
            miniExpand.title = '展开面板';

            miniPanel.appendChild(miniDiff);
            miniPanel.appendChild(miniBlack);
            miniPanel.appendChild(miniExpand);

            const full = document.createElement('div');
            full.id = 'tdk-lg-full-panel';

            full.innerHTML = `
<div id="tdk-lg-header">
    <div id="tdk-lg-title">洛谷工具箱</div>
    <div id="tdk-lg-tools">
        <button class="tdk-lg-mini-btn" data-action="minimize" title="最小化">—</button>
        <button class="tdk-lg-mini-btn" data-action="font-small">A−</button>
        <button class="tdk-lg-mini-btn" data-action="font-big">A+</button>
    </div>
</div>
<div id="tdk-lg-tabs">
    <button class="tdk-lg-tab" data-tab="random">随机题</button>
    <button class="tdk-lg-tab" data-tab="color">染色</button>
    <button class="tdk-lg-tab" data-tab="chart">统计</button>
    <button class="tdk-lg-tab" data-tab="settings">设置</button>
</div>
<div class="tdk-lg-panel" data-panel="random"></div>
<div class="tdk-lg-panel" data-panel="color"></div>
<div class="tdk-lg-panel" data-panel="chart"></div>
<div class="tdk-lg-panel" data-panel="settings"></div>
<div id="tdk-lg-status">准备就绪</div>
<div id="tdk-lg-request"></div>
<div id="tdk-lg-resize-hint">↘</div>
            `;

            box.appendChild(miniPanel);
            box.appendChild(full);
            document.body.appendChild(box);

            this.restoreUI(box);
            this.renderPanels();
            this.bindEvents(box);
            this.switchTab(this.activeTab);
            this.updateMiniPanel();
            this.updateRequestBadge();
            this.applyModuleState();

            if (this.getUIState().minimized === true) this.setMinimized(true);
        },

        renderPanels() {
            this.renderRandomPanel();
            this.renderColorPanel();
            this.renderChartPanel();
            this.refreshSettingsPanel();
        },

        renderRandomPanel() {
            const panel = document.querySelector('[data-panel="random"]');
            if (!panel) return;

            panel.innerHTML = `
<p class="tdk-lg-desc">按难度随机打开一道洛谷题，支持过滤已 AC、拉黑题目、缓存最大页。</p>
<div id="tdk-lg-diff-grid"></div>
<div class="tdk-lg-row">
    <label for="tdk-lg-allow-ac">允许随机已 AC 题</label>
    <input id="tdk-lg-allow-ac" class="tdk-lg-switch" type="checkbox">
</div>
<div class="tdk-lg-actions">
    <button class="tdk-lg-btn main" data-action="random">随机一道题</button>
    <button class="tdk-lg-btn orange" data-action="refresh-pages">刷新页数</button>
    <button class="tdk-lg-btn red" data-action="black-current">拉黑当前</button>
    <button class="tdk-lg-btn purple" data-action="toggle-blacklist">拉黑列表</button>
    <button class="tdk-lg-btn gray" data-action="clear-blacklist">清空拉黑</button>
</div>
<div id="tdk-lg-blacklist"></div>
            `;

            const grid = panel.querySelector('#tdk-lg-diff-grid');
            for (const item of DIFFICULTIES.slice(1)) {
                const btn = document.createElement('button');
                btn.className = 'tdk-lg-diff-btn';
                btn.dataset.diff = String(item.id);
                btn.textContent = item.name;
                btn.style.color = item.color;
                btn.onclick = () => {
                    settings.random.difficulty = String(item.id);
                    saveSettings({ refreshSettings: false, chart: false, color: false });
                    this.setActiveDifficulty(String(item.id));
                };
                grid.appendChild(btn);
            }

            const allow = panel.querySelector('#tdk-lg-allow-ac');
            allow.checked = !!settings.random.allowAC;
            allow.onchange = () => {
                settings.random.allowAC = allow.checked;
                saveSettings({ refreshSettings: false, chart: false, color: false });
            };

            this.setActiveDifficulty(settings.random.difficulty);
            this.renderBlacklistPanel();
        },

        setActiveDifficulty(diff) {
            settings.random.difficulty = String(diff || '3');

            document.querySelectorAll('.tdk-lg-diff-btn').forEach(btn => {
                const cur = Number(btn.dataset.diff);
                const active = btn.dataset.diff === settings.random.difficulty;

                btn.classList.toggle('active', active);

                if (active) {
                    btn.style.background = COLOR[cur];
                    btn.style.borderColor = COLOR[cur];
                    btn.style.color = '#fff';
                } else {
                    btn.style.background = '#f8f9fb';
                    btn.style.borderColor = 'rgba(0,0,0,.08)';
                    btn.style.color = COLOR[cur];
                }
            });

            const entry = RandomModule.getCacheEntry(settings.random.difficulty);
            if (entry) {
                this.setStatus('当前难度最大页：' + entry.maxPage + '；每页 ' + entry.pageSize + ' 题；上次更新：' + RandomModule.formatTime(entry.updatedAt));
            }

            this.updateMiniPanel();
        },

        syncRandomControls() {
            const allow = document.getElementById('tdk-lg-allow-ac');
            if (allow) allow.checked = !!settings.random.allowAC;
            this.setActiveDifficulty(settings.random.difficulty);
        },

        applyModuleState() {
            const box = document.getElementById('tdk-lg-box');
            if (!box) return;

            const toggle = (selector, enabled) => {
                box.querySelectorAll(selector).forEach(el => {
                    el.disabled = !enabled;
                });
            };

            toggle('[data-action="random"], [data-action="refresh-pages"], [data-action="black-current"], [data-action="toggle-blacklist"], [data-action="clear-blacklist"], #tdk-lg-allow-ac, .tdk-lg-diff-btn, #tdk-lg-mini-diff, #tdk-lg-mini-black', settings.modules.random);
            toggle('[data-action="rerender-color"], [data-action="clear-diff-cache"]', settings.modules.color);
            toggle('[data-action="rerender-chart"], #tdk-lg-chart-recent', settings.modules.chart);

            box.classList.toggle('tdk-random-disabled', !settings.modules.random);
            box.classList.toggle('tdk-color-disabled', !settings.modules.color);
            box.classList.toggle('tdk-chart-disabled', !settings.modules.chart);

            if (!settings.modules.chart) ChartModule.removeOld();
        },

        renderBlacklistPanel() {
            const panel = document.getElementById('tdk-lg-blacklist');
            if (!panel) return;

            const list = RandomModule.getBlacklist();
            panel.innerHTML = '';

            if (list.length === 0) {
                panel.innerHTML = '<div style="color:#777;">当前拉黑列表为空</div>';
                return;
            }

            list.forEach(pid => {
                const item = document.createElement('div');
                item.className = 'tdk-lg-black-item';

                const link = document.createElement('a');
                link.href = buildProblemUrl(pid);
                link.target = '_blank';
                link.textContent = pid;

                const removeBtn = document.createElement('button');
                removeBtn.textContent = '移除';
                removeBtn.onclick = () => {
                    RandomModule.removeFromBlacklist(pid);
                    this.renderBlacklistPanel();
                    this.setStatus('已移除拉黑题目 ' + pid);
                };

                item.appendChild(link);
                item.appendChild(removeBtn);
                panel.appendChild(item);
            });
        },

        renderColorPanel() {
            const panel = document.querySelector('[data-panel="color"]');
            if (!panel) return;

            const cacheCount = Object.keys(ProblemDifficulty.cache || {}).length;
            panel.innerHTML = `
<p class="tdk-lg-desc">评测记录页直接读取页面数据；练习页和比赛页会分批查询缺失难度，全部请求受统一限速控制。</p>
<div class="tdk-lg-row">
    <span>难度缓存</span>
    <strong>${cacheCount} 条</strong>
</div>
<div class="tdk-lg-actions">
    <button class="tdk-lg-btn main" data-action="rerender-color">刷新当前页染色</button>
    <button class="tdk-lg-btn gray" data-action="clear-diff-cache">清空难度缓存</button>
</div>
            `;
        },

        renderChartPanel() {
            const panel = document.querySelector('[data-panel="chart"]');
            if (!panel) return;

            panel.innerHTML = `
<p class="tdk-lg-desc">在首页、个人主页、练习页显示通过题目难度统计，并叠加最近通过题目的难度比例折线。</p>
<div class="tdk-lg-row">
    <label for="tdk-lg-chart-recent">最近通过题数</label>
    <input id="tdk-lg-chart-recent" type="number" min="${settings.chart.minRecentTotal}" max="${settings.chart.maxRecentTotal}" value="${settings.chart.recentTotal}" style="width:84px;height:28px;border:1px solid #ddd;border-radius:8px;padding:2px 6px;">
</div>
<div class="tdk-lg-actions">
    <button class="tdk-lg-btn main" data-action="rerender-chart">刷新统计图</button>
</div>
            `;

            const input = panel.querySelector('#tdk-lg-chart-recent');
            input.onchange = () => {
                settings.chart.recentTotal = Number(input.value);
                saveSettings({ refreshSettings: false, random: false, chart: true });
            };
        },

        getSettingSaveOptions(path) {
            const root = String(path || '').split('.')[0];
            const options = {
                refreshSettings: false,
                random: root === 'random' || path === 'modules.random',
                color: root === 'color' || path === 'modules.color',
                chart: root === 'chart' || path === 'modules.chart',
            };

            if (root === 'modules') {
                options.random = true;
                if (path === 'modules.color') options.color = true;
                if (path === 'modules.chart') options.chart = true;
            }

            return options;
        },

        refreshSettingsPanel() {
            const panel = document.querySelector('[data-panel="settings"]');
            if (!panel) return;

            panel.innerHTML = '';

            for (const section of SETTING_SCHEMA) {
                const box = document.createElement('div');
                box.className = 'tdk-setting-section';

                const title = document.createElement('h4');
                title.textContent = section.title;
                box.appendChild(title);

                for (const item of section.items) {
                    const row = document.createElement('div');
                    row.className = 'tdk-setting-item';

                    const label = document.createElement('label');
                    label.textContent = item.label;
                    row.appendChild(label);

                    let input;

                    if (item.type === 'boolean') {
                        input = document.createElement('input');
                        input.type = 'checkbox';
                        input.className = 'tdk-lg-switch';
                        input.checked = !!getByPath(settings, item.path);
                    } else if (item.type === 'select') {
                        input = document.createElement('select');
                        for (const opt of item.options || []) {
                            const option = document.createElement('option');
                            option.value = opt.value;
                            option.textContent = opt.label;
                            input.appendChild(option);
                        }
                        input.value = String(getByPath(settings, item.path));
                    } else {
                        input = document.createElement('input');
                        input.type = 'number';
                        if (item.min !== undefined) input.min = item.min;
                        if (item.max !== undefined) input.max = item.max;
                        if (item.step !== undefined) input.step = item.step;
                        input.value = getByPath(settings, item.path);
                    }

                    input.dataset.path = item.path;
                    input.dataset.type = item.type;
                    if (item.min !== undefined) input.dataset.min = String(item.min);
                    if (item.max !== undefined) input.dataset.max = String(item.max);

                    row.appendChild(input);
                    box.appendChild(row);
                }

                panel.appendChild(box);
            }

            const help = document.createElement('div');
            help.className = 'tdk-setting-help';
            help.textContent = '扩展方式：在脚本顶部 SETTING_SCHEMA 里添加配置项，并在 DEFAULT_SETTINGS 里给默认值；请求必须使用 RequestQueue.fetch/text/json/doc，才能保证全局不超过 2 次/秒。';
            panel.appendChild(help);
        },

        handleSettingChange(input) {
            const path = input?.dataset?.path;
            const type = input?.dataset?.type;
            if (!path || !type) return;

            let value;

            if (type === 'boolean') {
                value = input.checked;
            } else if (type === 'number') {
                const min = input.dataset.min === undefined ? undefined : Number(input.dataset.min);
                const max = input.dataset.max === undefined ? undefined : Number(input.dataset.max);
                value = Number(input.value);
                if (min !== undefined || max !== undefined) value = clamp(value, min ?? value, max ?? value);
            } else {
                value = input.value;
            }

            setByPath(settings, path, value);
            saveSettings(this.getSettingSaveOptions(path));

            if (type === 'number') input.value = getByPath(settings, path);
        },

        switchTab(tab) {
            this.activeTab = tab || 'random';

            document.querySelectorAll('.tdk-lg-tab').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === this.activeTab));
            document.querySelectorAll('.tdk-lg-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.panel === this.activeTab));

            const ui = this.getUIState();
            ui.activeTab = this.activeTab;
            writeJSON(KEY.ui, ui);
        },

        setBusy(busy) {
            document.querySelectorAll('#tdk-lg-box .tdk-lg-btn').forEach(btn => {
                btn.disabled = !!busy;
            });

            if (!busy) this.applyModuleState();
        },

        async runRandom() {
            this.setBusy(true);

            try {
                await RandomModule.randomProblem(settings.random.difficulty, settings.random.allowAC);
            } catch (err) {
                console.error(err);
                this.setStatus(err.message || String(err));
                alert(err.message || String(err));
            } finally {
                this.setBusy(false);
            }
        },

        async refreshCurrentDifficulty() {
            this.setBusy(true);

            try {
                await RandomModule.refreshMaxPage(settings.random.difficulty);
            } catch (err) {
                console.error(err);
                this.setStatus(err.message || String(err));
                alert(err.message || String(err));
            } finally {
                this.setBusy(false);
            }
        },

        bindEvents(box) {
            const header = document.getElementById('tdk-lg-header');
            const miniPanel = document.getElementById('tdk-lg-mini-panel');

            box.addEventListener('click', e => {
                const action = e.target.closest('[data-action]')?.dataset.action;
                if (!action) return;

                if (action === 'minimize') this.setMinimized(true);
                if (action === 'font-small') {
                    this.applyFontSize(Number(this.getUIState().fontSize || 14) - 1);
                    this.saveUIState(box);
                }
                if (action === 'font-big') {
                    this.applyFontSize(Number(this.getUIState().fontSize || 14) + 1);
                    this.saveUIState(box);
                }
                if (action === 'random') this.runRandom();
                if (action === 'refresh-pages') this.refreshCurrentDifficulty();
                if (action === 'black-current') RandomModule.quickBlacklistCurrent();
                if (action === 'toggle-blacklist') {
                    document.getElementById('tdk-lg-blacklist')?.classList.toggle('show');
                    this.renderBlacklistPanel();
                }
                if (action === 'clear-blacklist') {
                    if (!confirm('确定清空所有拉黑题目吗？')) return;
                    RandomModule.clearBlacklist();
                    this.renderBlacklistPanel();
                    this.setStatus('已清空拉黑列表');
                }
                if (action === 'rerender-color') {
                    ColorModule.practiceAutoDone = false;
                    ColorModule.render();
                    this.setStatus('已触发当前页染色刷新');
                }
                if (action === 'clear-diff-cache') {
                    if (!confirm('确定清空题目难度缓存吗？')) return;
                    ProblemDifficulty.clear();
                    this.renderColorPanel();
                    this.setStatus('已清空题目难度缓存');
                }
                if (action === 'rerender-chart') {
                    ChartModule.removeOld();
                    ChartModule.render(true);
                    this.setStatus('已触发统计图刷新');
                }
            });

            box.addEventListener('change', e => {
                const input = e.target.closest('[data-path]');
                if (!input || !box.contains(input)) return;
                this.handleSettingChange(input);
            });

            document.querySelectorAll('.tdk-lg-tab').forEach(btn => {
                btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
            });

            document.getElementById('tdk-lg-mini-diff').onclick = e => {
                if (box.getAttribute('data-tdk-dragged') === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                this.runRandom();
            };

            document.getElementById('tdk-lg-mini-black').onclick = e => {
                if (box.getAttribute('data-tdk-dragged') === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                RandomModule.quickBlacklistCurrent();
            };

            document.getElementById('tdk-lg-mini-expand').onclick = e => {
                if (box.getAttribute('data-tdk-dragged') === '1') {
                    e.preventDefault();
                    e.stopPropagation();
                    return;
                }
                e.stopPropagation();
                this.setMinimized(false);
            };

            this.enableDrag(box, header, false);
            this.enableDrag(box, miniPanel, true);
            this.observeResize(box);
        },

        enableDrag(box, handle, allowButtonDrag) {
            let dragging = false;
            let moved = false;
            let startX = 0;
            let startY = 0;
            let startLeft = 0;
            let startTop = 0;

            handle.addEventListener('mousedown', e => {
                if (!allowButtonDrag && e.target.closest('button')) return;

                dragging = true;
                moved = false;
                startX = e.clientX;
                startY = e.clientY;

                const rect = box.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;

                box.style.left = startLeft + 'px';
                box.style.top = startTop + 'px';
                box.style.right = 'auto';
                box.style.bottom = 'auto';

                document.body.style.userSelect = 'none';
            });

            window.addEventListener('mousemove', e => {
                if (!dragging) return;

                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;

                const newLeft = Math.max(0, Math.min(window.innerWidth - 80, startLeft + dx));
                const newTop = Math.max(0, Math.min(window.innerHeight - 60, startTop + dy));

                box.style.left = newLeft + 'px';
                box.style.top = newTop + 'px';
            });

            window.addEventListener('mouseup', () => {
                if (!dragging) return;

                dragging = false;
                document.body.style.userSelect = '';

                if (moved) {
                    box.setAttribute('data-tdk-dragged', '1');
                    setTimeout(() => box.removeAttribute('data-tdk-dragged'), 160);
                }

                const ui = this.getUIState();
                ui.left = box.style.left;
                ui.top = box.style.top;
                ui.right = 'auto';
                ui.bottom = 'auto';

                if (!box.classList.contains('tdk-minimized')) {
                    ui.width = box.style.width || box.getBoundingClientRect().width + 'px';
                    ui.height = box.style.height || box.getBoundingClientRect().height + 'px';
                }

                writeJSON(KEY.ui, ui);
            });
        },

        observeResize(box) {
            if (typeof ResizeObserver === 'undefined') return;

            let timer = null;
            const observer = new ResizeObserver(() => {
                clearTimeout(timer);

                timer = setTimeout(() => {
                    if (box.classList.contains('tdk-minimized')) return;

                    const ui = this.getUIState();
                    ui.width = box.style.width || box.getBoundingClientRect().width + 'px';
                    ui.height = box.style.height || box.getBoundingClientRect().height + 'px';
                    writeJSON(KEY.ui, ui);
                }, 200);
            });

            observer.observe(box);
        },

        setMinimized(mini) {
            const box = document.getElementById('tdk-lg-box');
            const ui = this.getUIState();

            ui.minimized = mini === true;
            writeJSON(KEY.ui, ui);

            if (!box) return;

            box.classList.toggle('tdk-minimized', ui.minimized);

            if (ui.minimized) {
                box.style.height = 'auto';
                box.style.resize = 'none';
            } else {
                box.style.resize = 'both';
                if (ui.width) box.style.width = ui.width;
                if (ui.height) box.style.height = ui.height;
            }

            this.updateMiniPanel();
        },

        getCurrentDiffName() {
            const diff = String(settings.random.difficulty || '3');
            return DIFFICULTIES.find(x => String(x.id) === diff)?.name || '未知难度';
        },

        updateMiniPanel() {
            const diff = String(settings.random.difficulty || '3');
            const btn = document.getElementById('tdk-lg-mini-diff');
            if (!btn) return;

            btn.textContent = this.getCurrentDiffName();
            btn.style.background = COLOR[Number(diff)] || '#3498db';
        },

        setStatus(msg) {
            const node = document.getElementById('tdk-lg-status');
            if (node) node.innerText = msg;
        },

        updateRequestBadge() {
            const node = document.getElementById('tdk-lg-request');
            if (!node) return;

            node.innerText = `请求限速：≤ ${clamp(settings.request.maxPerSecond, 0.2, 2)} 次/秒；排队 ${RequestQueue.queue.length}；进行中 ${RequestQueue.active}；总请求 ${RequestQueue.total}`;
        },
    };

    function hookSpaRoute() {
        let last = location.href;
        let timer = null;

        function check() {
            if (location.href === last) return;

            last = location.href;
            clearTimeout(timer);

            timer = setTimeout(() => {
                ChartModule.removeOld();
                ColorModule.practiceAutoDone = false;
                ColorModule.render();
                ChartModule.render(true);
            }, 500);
        }

        const rawPushState = history.pushState;
        history.pushState = function () {
            rawPushState.apply(this, arguments);
            check();
        };

        const rawReplaceState = history.replaceState;
        history.replaceState = function () {
            rawReplaceState.apply(this, arguments);
            check();
        };

        window.addEventListener('popstate', check);
    }

    function init() {
        ProblemDifficulty.init();
        Toolbox.createUI();
        ColorModule.init();
        ChartModule.render();
        hookSpaRoute();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
