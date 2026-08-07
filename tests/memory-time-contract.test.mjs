import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import memoryTime from '../assets/js/memory-time.js';

const [html, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('../assets/js/app.js', import.meta.url), 'utf8')
]);

const clock = () => ({ storyDay: 3, segment: '上午', absolute: { year: 2026, month: 8, day: 3 } });

test('memory-time.js exposes clock and resolution API', () => {
    assert.equal(typeof memoryTime.normalizeClock, 'function');
    assert.equal(typeof memoryTime.resolve, 'function');
    assert.equal(typeof memoryTime.advance, 'function');
    assert.equal(typeof memoryTime.toTimeKey, 'function');
    assert.equal(typeof memoryTime.formatForPrompt, 'function');
    assert.ok(memoryTime.SEGMENT_NAMES.includes('清晨'));
});

test('normalizeClock defaults missing storyDay to 0', () => {
    assert.equal(memoryTime.normalizeClock({}).storyDay, 0);
    assert.equal(memoryTime.normalizeClock({ storyDay: 5 }).storyDay, 5);
});

test('resolve handles relative day words', () => {
    const base = clock();
    assert.equal(memoryTime.resolve('今天', base).storyDay, 3);
    assert.equal(memoryTime.resolve('昨天', base).storyDay, 2);
    assert.equal(memoryTime.resolve('前天', base).storyDay, 1);
    assert.equal(memoryTime.resolve('明天', base).storyDay, 4);
    assert.equal(memoryTime.resolve('后天', base).storyDay, 5);
    assert.equal(memoryTime.resolve('次日', base).storyDay, 4);
    assert.equal(memoryTime.resolve('三日后', base).storyDay, 6);
    assert.equal(memoryTime.resolve('几天后', base).storyDay, 5);
    assert.equal(memoryTime.resolve('几天后', base).confidence, 'low');
});

test('resolve combines day offset with segment', () => {
    const resolved = memoryTime.resolve('第二天清晨', clock());
    assert.equal(resolved.storyDay, 4);
    assert.equal(resolved.segment, '清晨');
    assert.equal(resolved.confidence, 'high');
});

test('resolve handles 昨晚/今晚 and bare segments', () => {
    const base = clock();
    const lastNight = memoryTime.resolve('昨晚', base);
    assert.equal(lastNight.storyDay, 2);
    assert.equal(lastNight.segment, '入夜');
    const tonight = memoryTime.resolve('今晚', base);
    assert.equal(tonight.storyDay, 3);
    assert.equal(tonight.segment, '入夜');
    assert.equal(memoryTime.resolve('下午', base).segment, '下午');
});

test('resolve handles explicit clock times', () => {
    const base = clock();
    const colon = memoryTime.resolve('16:00', base);
    assert.equal(colon.minutes, 960);
    assert.equal(colon.storyDay, 3);
    const afternoon = memoryTime.resolve('下午4点', base);
    assert.equal(afternoon.minutes, 960, '下午4点应解析为16:00');
});

test('resolve weekday with calendar and rejects without calendar', () => {
    const base = clock();
    // 2026-08-03 的星期几由 Date 计算，再验证解析出的绝对日期星期一致
    const currentWeekday = new Date(Date.UTC(2026, 7, 3)).getUTCDay();
    const target = (currentWeekday + 2) % 7;
    const names = ['日', '一', '二', '三', '四', '五', '六'];
    const resolved = memoryTime.resolve(`周${names[target]}`, base);
    assert.equal(resolved.source, 'weekday');
    assert.equal(resolved.absolute.weekday, target);
    assert.ok(resolved.confidence === 'high' || resolved.confidence === 'medium');

    const noCalendar = memoryTime.resolve('周五', { storyDay: 3 });
    assert.equal(noCalendar.confidence, 'low');
    assert.equal(noCalendar.source, 'weekday-no-calendar');
});

test('resolve handles absolute dates', () => {
    const resolved = memoryTime.resolve('2026年8月10日', clock());
    assert.equal(resolved.source, 'absolute');
    assert.equal(resolved.confidence, 'high');
    assert.deepEqual(
        { year: resolved.absolute.year, month: resolved.absolute.month, day: resolved.absolute.day },
        { year: 2026, month: 8, day: 10 }
    );
    assert.equal(resolved.storyDay, 7, 'D0=8月3日,则8月10日应为第7天');
});

test('resolve returns low confidence for unresolvable expressions', () => {
    const unresolved = memoryTime.resolve('那天', clock());
    assert.equal(unresolved.confidence, 'low');
    assert.equal(unresolved.source, 'unresolved');
});

test('advance only moves clock on explicit passage', () => {
    const base = clock();
    assert.equal(memoryTime.advance(base, '次日').clock.storyDay, 4);
    assert.equal(memoryTime.advance(base, '三日后').clock.storyDay, 6);
    assert.equal(memoryTime.advance(base, '几天后').clock.storyDay, 5);
    assert.equal(memoryTime.advance(base, '几天后').confidence, 'low');
    assert.equal(memoryTime.advance(base, '今天').advanced, false);
    assert.equal(memoryTime.advance(base, '今晚').clock.segment, '入夜');
    assert.equal(memoryTime.advance(base, '').advanced, false);
});

test('toTimeKey provides total ordering across days and segments', () => {
    const d1Morning = memoryTime.toTimeKey(1, '上午');
    const d1Afternoon = memoryTime.toTimeKey(1, '下午');
    const d2Morning = memoryTime.toTimeKey(2, '清晨');
    const d1Night = memoryTime.toTimeKey(1, null, 1380);
    assert.ok(d1Morning < d1Afternoon && d1Afternoon < d2Morning);
    assert.ok(d1Afternoon < d1Night && d1Night < d2Morning);
});

test('formatForPrompt includes day, segment and calendar', () => {
    const text = memoryTime.formatForPrompt(clock());
    assert.ok(text.includes('第3天'));
    assert.ok(text.includes('上午'));
    assert.ok(text.includes('2026'));
});

test('index.html loads memory-time.js before app.js', () => {
    const appIdx = html.indexOf('assets/js/app.js');
    const timeIdx = html.indexOf('assets/js/memory-time.js');
    assert.ok(appIdx > 0 && timeIdx > 0 && timeIdx < appIdx);
});
