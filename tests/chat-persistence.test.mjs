import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

const loadPersistence = async () => {
  const context = vm.createContext({ window: {} });
  const source = await readFile(new URL('../assets/js/chat-persistence.js', import.meta.url), 'utf8');
  vm.runInContext(source, context);
  return context.window.RPHChatPersistence;
};

const serialize = message => JSON.parse(JSON.stringify(message));

test('deleting a middle message updates shifted row positions', async () => {
  const persistence = await loadPersistence();
  const original = [
    { id: 'a', content: 'A' },
    { id: 'b', content: 'B' },
    { id: 'c', content: 'C' }
  ];
  const baseline = persistence.createBaseline(original, serialize);
  const next = [original[0], original[2], { id: 'd', content: 'D' }];
  const changes = persistence.createChanges(next, baseline, serialize);

  assert.deepEqual([...changes.deletes], ['b']);
  assert.deepEqual(
    Array.from(changes.upserts, item => [item.message.id, item.position]),
    [['c', 1], ['d', 2]]
  );
});

test('editing one message updates only that row', async () => {
  const persistence = await loadPersistence();
  const original = [{ id: 'a', content: 'A' }, { id: 'b', content: 'B' }];
  const baseline = persistence.createBaseline(original, serialize);
  const changes = persistence.createChanges(
    [{ id: 'a', content: 'A' }, { id: 'b', content: 'edited' }],
    baseline,
    serialize
  );

  assert.deepEqual([...changes.deletes], []);
  assert.equal(changes.upserts.length, 1);
  assert.equal(changes.upserts[0].message.id, 'b');
});

test('unchanged chats generate no database writes', async () => {
  const persistence = await loadPersistence();
  const messages = [{ id: 'a', content: 'A', storageStatus: 'final' }];
  const baseline = persistence.createBaseline(messages, serialize);
  const changes = persistence.createChanges(messages, baseline, serialize);
  assert.equal(changes.upserts.length, 0);
  assert.equal(changes.deletes.length, 0);
});

test('draft recovery marks interrupted output final without duplicating its marker', async () => {
  const persistence = await loadPersistence();
  const marker = '*-- App interrupted generation --*';
  const draft = { id: 'draft', content: 'partial output  ', storageStatus: 'draft' };

  assert.equal(persistence.recoverInterruptedDraft(draft, marker), true);
  assert.equal(draft.storageStatus, 'final');
  assert.equal(draft.content, `partial output\n\n${marker}`);
  assert.equal(persistence.recoverInterruptedDraft(draft, marker), false);
  assert.equal(draft.content.match(/App interrupted/g).length, 1);
});
