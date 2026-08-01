const endpoint = process.argv[2];
const requestedExpression = process.argv.slice(3).join(' ');
const expression = requestedExpression === 'setup'
    ? `JSON.stringify({
        inputs: [...document.querySelectorAll('input')].map((input, index) => ({
            index,
            type: input.type,
            value: input.value,
            placeholder: input.placeholder,
            disabled: input.disabled,
        })),
        buttons: [...document.querySelectorAll('button')].map((button, index) => ({
            index,
            text: button.innerText.trim(),
            disabled: button.disabled,
            display: getComputedStyle(button).display,
            rect: button.getBoundingClientRect().toJSON(),
        })),
    })`
    : requestedExpression === 'ime-setup-test'
        ? `(async () => {
            const name = String.fromCodePoint(27979, 35797, 36134, 21495);
            const input = document.querySelector('input[type="text"]');
            const modal = input?.closest('.fixed.inset-0');
            const button = modal ? [...modal.querySelectorAll('button')].at(-1) : null;
            if (!input || !button) throw new Error('Setup controls were not found.');
            input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: name }));
            input.value = name;
            input.dispatchEvent(new InputEvent('input', {
                bubbles: true,
                data: name,
                inputType: 'insertCompositionText',
                isComposing: true,
            }));
            const disabledBeforeClick = button.disabled;
            button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
            button.click();
            await new Promise(resolve => setTimeout(resolve, 750));
            const storedUser = await window.RPHStorage.get('rp_hub_user');
            return JSON.stringify({
                disabledBeforeClick,
                modalClosed: !input.isConnected,
                storedName: storedUser?.name || null,
            });
        })()`
    : requestedExpression === 'api-key-state'
        ? `(async () => {
            const input = [...document.querySelectorAll('input')]
                .find(element => element.placeholder === 'sk-...');
            const proxy = document.querySelector('#app')?.__vue_app__?._instance?.proxy;
            const settings = proxy?.settings || {};
            const storedSettings = await window.RPHStorage.get('rp_hub_settings');
            const providerId = settings.apiProviderId || null;
            return JSON.stringify({
                inputFound: !!input,
                inputFocused: document.activeElement === input,
                domLength: String(input?.value || '').length,
                stateLength: String(settings.apiKey || '').length,
                providerId,
                providerStateLength: String(settings.apiProviderKeys?.[providerId] || '').length,
                storedLength: String(storedSettings?.apiKey || '').length,
                storedProviderLength: String(storedSettings?.apiProviderKeys?.[providerId] || '').length,
            });
        })()`
    : requestedExpression === 'api-key-sync-test'
        ? `(async () => {
            const pause = delay => new Promise(resolve => setTimeout(resolve, delay));
            const testKey = 'sk-native-sync-test-only';
            const originalSettings = await window.RPHStorage.get('rp_hub_settings');
            const settingsLabel = String.fromCodePoint(35774, 32622);
            const generatorLabel = String.fromCodePoint(35282, 33394, 21345, 29983, 25104);
            const clickNav = label => {
                const button = [...document.querySelectorAll('button')]
                    .find(item => item.innerText.trim() === label);
                if (!button) throw new Error('Navigation button was not found.');
                button.click();
            };

            clickNav(settingsLabel);
            await pause(100);
            let input = [...document.querySelectorAll('input')]
                .find(element => element.placeholder === 'sk-...');
            if (!input) throw new Error('API Key input was not found.');
            input.value = testKey;
            input.dispatchEvent(new FocusEvent('blur'));
            await pause(1250);
            const storedDuringTest = await window.RPHStorage.get('rp_hub_settings');

            clickNav(generatorLabel);
            await pause(400);
            const iframe = document.querySelector('iframe[src*="character"]');
            if (!iframe?.contentWindow) throw new Error('Character workshop iframe was not found.');
            window.__rphCapturedGeneratorSettings = null;
            iframe.contentWindow.addEventListener('message', event => {
                if (event.data?.type === 'SYNC_SETTINGS') {
                    window.__rphCapturedGeneratorSettings = event.data.settings;
                }
            }, { once: true });
            window.dispatchEvent(new MessageEvent('message', { data: { type: 'WORKSHOP_READY' } }));
            await pause(100);
            const generatorSettings = window.__rphCapturedGeneratorSettings;

            clickNav(settingsLabel);
            await pause(100);
            input = [...document.querySelectorAll('input')]
                .find(element => element.placeholder === 'sk-...');
            input.value = originalSettings?.apiKey || '';
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new FocusEvent('blur'));
            await pause(1250);
            const restoredSettings = await window.RPHStorage.get('rp_hub_settings');
            delete window.__rphCapturedGeneratorSettings;

            return JSON.stringify({
                storedTestLength: String(storedDuringTest?.apiKey || '').length,
                generatorTestLength: String(generatorSettings?.apiKey || '').length,
                expectedTestLength: testKey.length,
                restoredLength: String(restoredSettings?.apiKey || '').length,
                originalLength: String(originalSettings?.apiKey || '').length,
            });
        })()`
    : requestedExpression === 'rich-message-state'
        ? `JSON.stringify({
            lifecycleActive: window.RPHFrameLifecycle?.getActiveCount?.() ?? null,
            lifecycleLimit: window.RPHFrameLifecycle?.maxActiveFrames ?? null,
            frames: [...document.querySelectorAll('iframe')].map((frame, index) => {
                const doc = frame.contentDocument;
                const body = doc?.body;
                const elements = body ? [...body.querySelectorAll('*')] : [];
                const visibleElements = elements.filter(element => {
                    const style = frame.contentWindow.getComputedStyle(element);
                    const rect = element.getBoundingClientRect();
                    return style.display !== 'none' && style.visibility !== 'hidden'
                        && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
                });
                const images = body ? [...body.querySelectorAll('img')] : [];
                const rect = frame.getBoundingClientRect();
                const markdown = frame.closest('.markdown-body');
                return {
                    index,
                    className: frame.className,
                    sourceKind: frame.srcdoc ? 'srcdoc' : (frame.getAttribute('src') || 'none'),
                    attributeNames: frame.getAttributeNames(),
                    styleLength: String(frame.getAttribute('style') || '').length,
                    sandboxPresent: frame.hasAttribute('sandbox'),
                    parentTag: frame.parentElement?.tagName || null,
                    parentClass: frame.parentElement?.className || '',
                    markdownHtmlLength: String(markdown?.innerHTML || '').length,
                    markdownTextLength: String(markdown?.innerText || '').trim().length,
                    markdownScriptCount: markdown?.querySelectorAll('script').length ?? null,
                    markdownButtonCount: markdown?.querySelectorAll('button,[role="button"],input[type="button"]').length ?? null,
                    suspended: frame.classList.contains('html-frame-suspended'),
                    intersectingViewport: rect.bottom > 0 && rect.top < window.innerHeight,
                    frameHeight: Math.round(rect.height),
                    srcdocLength: String(frame.srcdoc || '').length,
                    readyState: doc?.readyState || null,
                    bodyChildren: body?.children?.length ?? null,
                    bodyTextLength: String(body?.innerText || '').trim().length,
                    bodyHtmlLength: String(body?.innerHTML || '').length,
                    bodyScrollHeight: body?.scrollHeight ?? null,
                    elementCount: elements.length,
                    visibleElementCount: visibleElements.length,
                    scriptCount: body?.querySelectorAll('script').length ?? null,
                    styleCount: doc?.querySelectorAll('style,link[rel="stylesheet"]').length ?? null,
                    buttonCount: body?.querySelectorAll('button,[role="button"],input[type="button"]').length ?? null,
                    imageCount: images.length,
                    loadedImageCount: images.filter(image => image.complete && image.naturalWidth > 0).length,
                    bodyBackground: body ? frame.contentWindow.getComputedStyle(body).backgroundColor : null,
                    bodyColor: body ? frame.contentWindow.getComputedStyle(body).color : null,
                };
            }),
        })`
    : requestedExpression === 'rich-source-state'
        ? `(async () => {
            const characters = await window.RPHStorage.get('rp_hub_characters') || [];
            const reports = [];
            for (let characterIndex = 0; characterIndex < characters.length; characterIndex += 1) {
                const character = characters[characterIndex];
                const messages = await window.RPHStorage.loadChat(character.uuid);
                messages.forEach((message, messageIndex) => {
                    const content = String(message?.content || '');
                    if (!/<iframe\\b/i.test(content)) return;
                    reports.push({
                        characterIndex,
                        messageIndex,
                        contentLength: content.length,
                        iframeCount: (content.match(/<iframe\\b/gi) || []).length,
                        hasSrcdoc: /\\bsrcdoc\\s*=/i.test(content),
                        hasSrc: /\\bsrc\\s*=/i.test(content),
                        hasScript: /<script\\b/i.test(content),
                        hasFullDocument: /<!doctype html>|<html\\b/i.test(content),
                        hasCodeFence: content.includes(String.fromCharCode(96).repeat(3)),
                    });
                });
            }
            return JSON.stringify({ characterCount: characters.length, reports });
        })()`
    : requestedExpression === 'rich-layout-state'
        ? `JSON.stringify([...document.querySelectorAll('iframe.executable-html-frame')].map((frame, frameIndex) => {
            const doc = frame.contentDocument;
            const win = frame.contentWindow;
            const body = doc?.body;
            const summarize = element => {
                const rect = element.getBoundingClientRect();
                const style = win.getComputedStyle(element);
                return {
                    tag: element.tagName,
                    classLength: String(element.className || '').length,
                    top: Math.round(rect.top),
                    bottom: Math.round(rect.bottom),
                    left: Math.round(rect.left),
                    right: Math.round(rect.right),
                    width: Math.round(rect.width),
                    height: Math.round(rect.height),
                    display: style.display,
                    visibility: style.visibility,
                    opacity: style.opacity,
                    position: style.position,
                    zIndex: style.zIndex,
                    background: style.backgroundColor,
                };
            };
            const elements = body ? [...body.querySelectorAll('*')] : [];
            const rendered = elements.filter(element => {
                const rect = element.getBoundingClientRect();
                const style = win.getComputedStyle(element);
                return style.display !== 'none' && style.visibility !== 'hidden'
                    && Number(style.opacity || 1) > 0 && rect.width > 0 && rect.height > 0;
            });
            const bounds = rendered.reduce((result, element) => {
                const rect = element.getBoundingClientRect();
                result.minTop = Math.min(result.minTop, rect.top);
                result.maxBottom = Math.max(result.maxBottom, rect.bottom);
                return result;
            }, { minTop: Number.POSITIVE_INFINITY, maxBottom: Number.NEGATIVE_INFINITY });
            return {
                frameIndex,
                frameRect: frame.getBoundingClientRect().toJSON(),
                innerWidth: win?.innerWidth ?? null,
                innerHeight: win?.innerHeight ?? null,
                bodyScrollHeight: body?.scrollHeight ?? null,
                documentScrollHeight: doc?.documentElement?.scrollHeight ?? null,
                renderedBounds: bounds,
                bodyChildren: body ? [...body.children].slice(0, 24).map(summarize) : [],
                images: body ? [...body.querySelectorAll('img')].slice(0, 8).map(summarize) : [],
                buttons: body ? [...body.querySelectorAll('button,[role="button"],input[type="button"]')].slice(0, 12).map(summarize) : [],
            };
        }))`
    : requestedExpression === 'request-diagnostic-state'
        ? `JSON.stringify({
            latest: window.RPHRequestDiagnostics?.getLatest?.() || null,
            recordCount: window.RPHRequestDiagnostics?.getAll?.().length || 0,
            maxRecords: window.RPHRequestDiagnostics?.maxRecords || null,
        })`
    : requestedExpression === 'request-diagnostics-clear'
        ? `(() => {
            window.RPHRequestDiagnostics?.clear?.();
            return JSON.stringify({ recordCount: window.RPHRequestDiagnostics?.getAll?.().length || 0 });
        })()`
    : requestedExpression;

if (!endpoint || !expression) {
    console.error('Usage: node scripts/debug-webview.mjs <websocket-url> <expression>');
    process.exit(1);
}

const socket = new WebSocket(endpoint);
const timeout = setTimeout(() => {
    console.error('Timed out waiting for the WebView debugger.');
    socket.close();
    process.exit(1);
}, 5000);

socket.addEventListener('open', () => {
    socket.send(JSON.stringify({
        id: 1,
        method: 'Runtime.evaluate',
        params: {
            expression,
            awaitPromise: true,
            returnByValue: true,
        },
    }));
});

socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id !== 1) return;
    clearTimeout(timeout);
    if (message.error || message.result?.exceptionDetails) {
        console.error(JSON.stringify(message, null, 2));
        process.exitCode = 1;
    } else {
        console.log(JSON.stringify(message.result?.result?.value, null, 2));
    }
    socket.close();
});

socket.addEventListener('error', error => {
    clearTimeout(timeout);
    console.error(error.message || String(error));
    process.exit(1);
});
