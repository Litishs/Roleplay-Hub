import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// Locally deployed model servers (Ollama / LM Studio / OneAPI / vLLM) almost
// always speak plain HTTP on a private LAN IP.  Android 9+ blocks cleartext
// traffic by default, so without an explicit network security config the
// WebView fetch fails silently with "Failed to fetch" and zero network bytes.
test('network-security-config permits cleartext for LAN-deployed APIs', async () => {
  const config = await readFile(
    new URL('../android/app/src/main/res/xml/network_security_config.xml', import.meta.url),
    'utf8'
  );

  // Android's <domain> entries do not support CIDR ranges, so the private
  // ranges (192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12) are covered by permitting
  // cleartext at the base-config level.  HTTPS validation is untouched.
  assert.match(config, /<base-config\s+cleartextTrafficPermitted="true"\s*>/);
  assert.match(config, /<certificates\s+src="system"\s*\/>/);
});

test('AndroidManifest declares the network security config', async () => {
  const manifest = await readFile(
    new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url),
    'utf8'
  );
  assert.match(manifest, /android:networkSecurityConfig="@xml\/network_security_config"/);
});

test('capacitor config allows mixed content so HTTPS origin can fetch HTTP LAN endpoints', async () => {
  const cap = await readFile(new URL('../capacitor.config.json', import.meta.url), 'utf8');
  const config = JSON.parse(cap);
  // Capacitor serves the app from https://localhost; fetching http://<lan-ip>
  // is mixed content and must be explicitly allowed, otherwise the WebView
  // blocks it even when network_security_config permits cleartext.
  assert.equal(config.android.allowMixedContent, true);
});
