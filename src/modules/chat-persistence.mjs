
    'use strict';

    const signature = (message, position) => `${position}\n${JSON.stringify(message)}`;

    const createBaseline = (messages, serialize) => {
        const baseline = new Map();
        (messages || []).forEach((message, position) => {
            const serialized = serialize(message);
            baseline.set(serialized.id, signature(serialized, position));
        });
        return baseline;
    };

    const createChanges = (messages, baseline, serialize) => {
        const currentIds = new Set();
        const upserts = [];
        (messages || []).forEach((message, position) => {
            const serialized = serialize(message);
            currentIds.add(serialized.id);
            const nextSignature = signature(serialized, position);
            if (baseline.get(serialized.id) !== nextSignature) {
                upserts.push({ position, message: serialized, signature: nextSignature });
            }
        });
        const deletes = [...baseline.keys()].filter(id => !currentIds.has(id));
        return { upserts, deletes };
    };

    const recoverInterruptedDraft = (message, marker) => {
        if (!message || message.storageStatus !== 'draft') return false;
        // content 未来若演进为结构化对象，String() 强转会覆写成 '[object Object]'。
        // 非字符串内容直接拒绝恢复，保持原状交给上层处理。
        if (typeof message.content !== 'string') return false;
        message.content = message.content.trimEnd();
        if (marker && !message.content.includes(marker)) {
            message.content = [message.content, marker].filter(Boolean).join('\n\n');
        }
        message.storageStatus = 'final';
        return true;
    };

    const RPHChatPersistence = { signature, createBaseline, createChanges, recoverInterruptedDraft };


export { RPHChatPersistence };


