
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
        message.content = String(message.content || '').trimEnd();
        if (marker && !message.content.includes(marker)) {
            message.content = [message.content, marker].filter(Boolean).join('\n\n');
        }
        message.storageStatus = 'final';
        return true;
    };

    const RPHChatPersistence = { signature, createBaseline, createChanges, recoverInterruptedDraft };


export { RPHChatPersistence };


