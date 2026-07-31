import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

class FakeElement {}

class FakeFrame extends FakeElement {
  constructor(source) {
    super();
    this.srcdoc = source;
    this.originalSource = source;
    this.style = {};
    this.isConnected = true;
    this.classes = new Set(['executable-html-frame']);
    this.classList = {
      contains: name => this.classes.has(name),
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name)
    };
  }

  getAttribute(name) { return name === 'srcdoc' ? this.srcdoc : null; }
  setAttribute(name, value) { this[name] = value; }
  getBoundingClientRect() { return { height: 180 }; }
  querySelectorAll() { return []; }
}

test('HTML card lifecycle keeps at most three iframes active', async () => {
  const frames = Array.from({ length: 6 }, (_, index) => new FakeFrame(`<p>${index}</p>`));
  let intersectionCallback;
  class FakeIntersectionObserver {
    constructor(callback) { intersectionCallback = callback; }
    observe() {}
  }
  class FakeMutationObserver { observe() {} }
  const body = new FakeElement();
  body.querySelectorAll = () => frames;
  const document = { readyState: 'complete', body };
  const window = {};
  const context = vm.createContext({
    window,
    document,
    HTMLElement: FakeElement,
    HTMLIFrameElement: FakeFrame,
    IntersectionObserver: FakeIntersectionObserver,
    MutationObserver: FakeMutationObserver
  });
  window.IntersectionObserver = FakeIntersectionObserver;

  for (const path of ['assets/js/runtime-policy.js', 'assets/js/html-frame-lifecycle.js']) {
    const source = await readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    vm.runInContext(source, context, { filename: path });
  }

  for (const frame of frames) intersectionCallback([{ target: frame, isIntersecting: true }]);
  assert.equal(window.RPHFrameLifecycle.getActiveCount(), 3);
  assert.equal(window.RPHFrameLifecycle.maxActiveFrames, 3);

  intersectionCallback([{ target: frames[5], isIntersecting: false }]);
  assert.equal(window.RPHFrameLifecycle.getActiveCount(), 2);
  intersectionCallback([{ target: frames[0], isIntersecting: true }]);
  assert.equal(frames[0].srcdoc, frames[0].originalSource);
  assert.ok(window.RPHFrameLifecycle.getActiveCount() <= 3);
});
