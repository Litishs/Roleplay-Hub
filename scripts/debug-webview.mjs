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
