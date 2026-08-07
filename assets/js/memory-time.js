/**
 * RPHMemoryTime — 记忆时钟与时间解析（P0，纯逻辑，零 DOM 依赖）
 *
 * 目标：给时间线记忆提供"绝对时间锚定"的地基。
 *   - 剧情时钟状态：storyDay（第 N 天，D0=开篇）+ 时段 + 可选真实日历
 *   - 解析"昨晚 / 周五 / 三日后 / 次日清晨 / 16:00"等表达为绝对锚点
 *   - 显式跳转才推进时钟；无法解析时返回低置信度，不硬造日期
 *   - 数值时间键（storyDay*1440+分钟）作为唯一排序依据
 *
 * 可在 Node 环境直接 import 用于测试。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.RPHMemoryTime = factory();
    }
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const SEGMENTS = Object.freeze({
        '清晨': 0,
        '上午': 1,
        '正午': 2,
        '下午': 3,
        '傍晚': 4,
        '入夜': 5,
        '深夜': 6,
        '子夜': 7
    });
    const SEGMENT_NAMES = Object.freeze(Object.keys(SEGMENTS));
    const SEGMENT_MINUTES = Object.freeze({
        '清晨': 120,
        '上午': 300,
        '正午': 420,
        '下午': 540,
        '傍晚': 630,
        '入夜': 660,
        '深夜': 780,
        '子夜': 960
    });
    const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const WEEKDAY_DIGITS = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };

    const DAY_DELTAS = Object.freeze({
        '今天': 0, '今日': 0,
        '昨天': -1, '昨日': -1, '昨夜': -1, '昨晚': -1,
        '前天': -2, '前日': -2,
        '明天': 1, '明日': 1,
        '后天': 2, '后日': 2,
        '次日': 1, '第二天': 1
    });

    const CN_DIGITS = Object.freeze({
        '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4,
        '五': 5, '六': 6, '七': 7, '八': 8, '九': 9
    });

    const chineseNumberToInt = (raw) => {
        const text = String(raw || '').trim();
        if (/^\d+$/.test(text)) return Number(text);
        if (text === '十') return 10;
        if (text.startsWith('十')) return 10 + (CN_DIGITS[text[1]] ?? 0);
        if (text.endsWith('十')) return (CN_DIGITS[text[0]] ?? 1) * 10;
        if (text.includes('十')) {
            const [head, tail] = text.split('十');
            return (CN_DIGITS[head] ?? 1) * 10 + (CN_DIGITS[tail] ?? 0);
        }
        return CN_DIGITS[text] ?? null;
    };

    const normalize = (value) => String(value || '').replace(/\s+/g, '').trim();

    const normalizeClock = (clock) => {
        const storyDay = Number(clock?.storyDay);
        const segment = Object.prototype.hasOwnProperty.call(SEGMENTS, clock?.segment) ? clock.segment : null;
        const absolute = clock?.absolute && typeof clock.absolute === 'object'
            ? { ...clock.absolute }
            : null;
        return {
            storyDay: Number.isFinite(storyDay) ? Math.max(0, Math.floor(storyDay)) : 0,
            segment,
            absolute,
            confidence: clock?.confidence === 'low' || clock?.confidence === 'medium' ? clock.confidence : 'high'
        };
    };

    const toMinutes = (segment, explicitMinutes) => {
        if (Number.isFinite(explicitMinutes)) {
            return Math.max(0, Math.min(1439, Math.floor(explicitMinutes)));
        }
        if (segment && SEGMENT_MINUTES[segment] !== undefined) return SEGMENT_MINUTES[segment];
        return null;
    };

    /**
     * 数值时间键：唯一排序依据。
     * @param {number} storyDay 第 N 天
     * @param {string|null} segment 时段名
     * @param {number|null} explicitMinutes 显式分钟（0–1439）
     */
    const toTimeKey = (storyDay, segment = null, explicitMinutes = null) => {
        const day = Number.isFinite(Number(storyDay)) ? Math.max(0, Math.floor(Number(storyDay))) : 0;
        const minutes = toMinutes(segment, explicitMinutes);
        return day * 1440 + (minutes === null ? 0 : minutes);
    };

    const daysInMonth = (year, month) => new Date(year, month, 0).getDate();

    const dateToDayNumber = (year, month, day) => {
        const y = Number(year), m = Number(month), d = Number(day);
        if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
        return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
    };

    const dayNumberToDate = (dayNumber) => {
        const date = new Date(dayNumber * 86400000);
        return {
            year: date.getUTCFullYear(),
            month: date.getUTCMonth() + 1,
            day: date.getUTCDate(),
            weekday: date.getUTCDay()
        };
    };

    const addDaysToAbsolute = (absolute, delta) => {
        if (!absolute || !Number.isFinite(Number(absolute.year))) return null;
        const base = dateToDayNumber(absolute.year, absolute.month, absolute.day);
        if (base === null) return null;
        const result = dayNumberToDate(base + delta);
        return { year: result.year, month: result.month, day: result.day, weekday: result.weekday };
    };

    const diffDays = (from, to) => {
        const a = dateToDayNumber(from?.year, from?.month, from?.day);
        const b = dateToDayNumber(to?.year, to?.month, to?.day);
        if (a === null || b === null) return null;
        return b - a;
    };

    const matchSegment = (text) => {
        for (const name of SEGMENT_NAMES) {
            if (text.includes(name)) return name;
        }
        return null;
    };

    const matchDayDelta = (text) => {
        const dayWord = Object.keys(DAY_DELTAS).find(word => text.startsWith(word));
        if (dayWord !== undefined) return { delta: DAY_DELTAS[dayWord], confidence: 'high', word: dayWord };

        const offset = text.match(/^([0-9一二三四五六七八九十两]{1,3})(?:天|日)(?:之)?后/);
        if (offset) {
            const number = chineseNumberToInt(offset[1]);
            if (number !== null) {
                return { delta: Math.max(1, number), confidence: 'high', word: offset[0] };
            }
        }
        if (/^(?:几天|数日|数天)(?:之)?后/.test(text)) {
            return { delta: 2, confidence: 'low', word: '几天后' };
        }
        return null;
    };

    const matchWeekday = (text) => {
        const m = text.match(/^(?:周|星期|礼拜)([一二三四五六日天])/);
        if (!m) return null;
        return WEEKDAY_DIGITS[m[1]];
    };

    const matchAbsoluteDate = (text) => {
        const full = text.match(/^(20\d{2})年(\d{1,2})月(\d{1,2})日?/);
        if (full) return { year: Number(full[1]), month: Number(full[2]), day: Number(full[3]) };
        const partial = text.match(/^(\d{1,2})月(\d{1,2})日?/);
        if (partial) return { year: null, month: Number(partial[1]), day: Number(partial[2]) };
        return null;
    };

    const matchClockTime = (text) => {
        const colon = text.match(/(\d{1,2})[:：](\d{2})/);
        if (colon) return { hours: Number(colon[1]), minutes: Number(colon[2]) };
        const point = text.match(/(\d{1,2})点(?:(\d{1,2})分?)?/);
        if (point) {
            let hours = Number(point[1]);
            const minutes = point[2] ? Number(point[2]) : 0;
            if (/^(?:下午|傍晚|入夜|深夜|晚上)/.test(text) && hours < 12) hours += 12;
            return { hours, minutes };
        }
        return null;
    };

    const unresolved = (relative, clock, source = 'unresolved') => ({
        storyDay: null,
        segment: null,
        minutes: null,
        absolute: null,
        confidence: 'low',
        source,
        relative
    });

    const anchor = (storyDay, segment, minutes, absolute, confidence, source, relative) => ({
        storyDay: Math.max(0, Number(storyDay) || 0),
        segment,
        minutes: toMinutes(segment, minutes),
        absolute,
        confidence,
        source,
        relative
    });

    /**
     * 把一条时间表达解析为绝对锚点。
     * @param {string} expression 如 "昨晚" / "三日后" / "周五" / "次日清晨"
     * @param {Object} clock 当前剧情时钟
     * @returns {Object} anchor
     */
    const resolve = (expression, clock) => {
        const text = normalize(expression);
        const base = normalizeClock(clock);
        if (!text) return unresolved(expression, base);

        // 1) 纯时段词
        if (SEGMENTS[text] !== undefined) {
            return anchor(base.storyDay, text, null, base.absolute, 'high', 'segment', text);
        }

        // 2) 绝对日期
        const absoluteMatch = matchAbsoluteDate(text);
        if (absoluteMatch) {
            const year = absoluteMatch.year || base.absolute?.year || null;
            const abs = year ? {
                year,
                month: absoluteMatch.month,
                day: absoluteMatch.day,
                weekday: new Date(Date.UTC(year, absoluteMatch.month - 1, absoluteMatch.day)).getUTCDay()
            } : { year: null, month: absoluteMatch.month, day: absoluteMatch.day, weekday: null };
            const storyDay = (base.absolute?.year && year)
                ? diffDays(base.absolute, abs)
                : null;
            return {
                storyDay,
                segment: matchSegment(text) || null,
                minutes: null,
                absolute: abs,
                confidence: year ? 'high' : 'medium',
                source: 'absolute',
                relative: text
            };
        }

        // 3) 星期
        const weekday = matchWeekday(text);
        if (weekday !== null) {
            if (!base.absolute?.year) {
                return unresolved(expression, base, 'weekday-no-calendar');
            }
            const currentWeekday = new Date(Date.UTC(base.absolute.year, base.absolute.month - 1, base.absolute.day)).getUTCDay();
            const delta = (weekday - currentWeekday + 7) % 7;
            const abs = addDaysToAbsolute(base.absolute, delta);
            return {
                storyDay: base.storyDay + delta,
                segment: matchSegment(text) || null,
                minutes: null,
                absolute: abs,
                confidence: delta === 0 ? 'medium' : 'high',
                source: 'weekday',
                relative: text
            };
        }

        // 4) 相对天数（今天/昨天/次日/三日后…）
        const dayMatch = matchDayDelta(text);
        if (dayMatch) {
            const segment = matchSegment(text) || (/晚|夜$/.test(dayMatch.word) ? '入夜' : null);
            const abs = base.absolute ? addDaysToAbsolute(base.absolute, dayMatch.delta) : null;
            return anchor(
                base.storyDay + dayMatch.delta,
                segment,
                null,
                abs,
                dayMatch.confidence,
                'relative',
                text
            );
        }

        // 5) 昨晚/今晚/当夜（特殊：入夜时段 + 天偏移）
        if (/^(?:昨晚|昨夜)/.test(text)) {
            const abs = base.absolute ? addDaysToAbsolute(base.absolute, -1) : null;
            return anchor(base.storyDay - 1, '入夜', null, abs, 'high', 'relative', text);
        }
        if (/^(?:今晚|今夜|当晚|当夜)/.test(text)) {
            return anchor(base.storyDay, '入夜', null, base.absolute, 'high', 'relative', text);
        }

        // 6) 显式钟点
        const clockTime = matchClockTime(text);
        if (clockTime) {
            return anchor(
                base.storyDay,
                null,
                clockTime.hours * 60 + clockTime.minutes,
                base.absolute,
                'high',
                'clock',
                text
            );
        }

        // 7) 纯时段词出现在中间（如 "周五清晨" 已被 weekday 分支处理，"清晨" 单独已处理）
        const anySegment = matchSegment(text);
        if (anySegment) {
            return anchor(base.storyDay, anySegment, null, base.absolute, 'high', 'segment', text);
        }

        return unresolved(expression, base);
    };

    /**
     * 推进剧情时钟（只有显式跳转才推进；无法判断时不推进）。
     * @param {Object} clock
     * @param {string} expression
     * @returns {{clock: Object, advanced: boolean, confidence: string}}
     */
    const advance = (clock, expression) => {
        const text = normalize(expression);
        const base = normalizeClock(clock);
        if (!text) return { clock: base, advanced: false, confidence: 'high' };

        const dayMatch = matchDayDelta(text);
        if (dayMatch) {
            const segment = matchSegment(text) || (/晚|夜$/.test(dayMatch.word) ? '入夜' : null);
            return {
                clock: {
                    storyDay: base.storyDay + dayMatch.delta,
                    segment: segment || base.segment,
                    absolute: base.absolute ? addDaysToAbsolute(base.absolute, dayMatch.delta) : null,
                    confidence: dayMatch.confidence
                },
                advanced: dayMatch.delta !== 0,
                confidence: dayMatch.confidence
            };
        }
        if (/^(?:今晚|今夜|当晚)/.test(text)) {
            return {
                clock: { ...base, segment: '入夜' },
                advanced: false,
                confidence: 'high'
            };
        }
        return { clock: base, advanced: false, confidence: 'high' };
    };

    const formatAbsolute = (absolute) => {
        if (!absolute?.year) return '';
        const weekday = Number.isFinite(Number(absolute.weekday))
            ? WEEKDAY_NAMES[absolute.weekday]
            : new Date(Date.UTC(absolute.year, absolute.month - 1, absolute.day)).getUTCDay();
        const weekdayName = WEEKDAY_NAMES[weekday];
        return `（${absolute.year}-${String(absolute.month).padStart(2, '0')}-${String(absolute.day).padStart(2, '0')} ${weekdayName}）`;
    };

    /**
     * 注入提取提示词的时钟描述。
     */
    const formatForPrompt = (clock) => {
        const base = normalizeClock(clock);
        const dayPart = `第${base.storyDay}天`;
        const segmentPart = base.segment ? `·${base.segment}` : '';
        return `当前剧情时间：${dayPart}${segmentPart}${formatAbsolute(base.absolute)}（第0天为开篇，仅剧情明确跳转才推进日期）`;
    };

    return {
        SEGMENTS,
        SEGMENT_NAMES,
        WEEKDAY_NAMES,
        normalizeClock,
        toTimeKey,
        toMinutes,
        resolve,
        advance,
        formatForPrompt,
        formatAbsolute
    };
});
