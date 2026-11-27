/* Alert page core: the connection code a device hands to the PC apps, and what the page can do on this device.
   No DOM and no network here, so the same file runs under Node for tests (website/tests/alerts.test.cjs).

   Connection code: "WP1." + base64url(JSON {e, p, a, k, u, n})
     e  push endpoint of this device's subscription (PushSubscription.endpoint)
     p  the subscription's P-256 public key, a its 16-byte authentication secret (RFC 8291)
     k  the private half of the VAPID signing key this page made for the subscription (RFC 8292)
     u  this page's address (what a notification opens)
     n  a device label for display
   The PC apps read it with utility/module/web_push.py (parse_code) and binance-manager/pushCore.js (parseCode). */
(() => {
    'use strict';
    const PREFIX = 'WP1.';
    const b64url = bytes => {
        let text = '';
        for (const byte of new Uint8Array(bytes)) text += String.fromCharCode(byte);
        return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    };
    const utf8 = text => new TextEncoder().encode(text);
    // A code is complete or it is not made: every part is checked here, the PC apps check again.
    function buildCode({ endpoint, p256dh, auth, privateKey, page, device }) {
        const sizes = [[p256dh, 65], [auth, 16]];
        if (typeof endpoint !== 'string' || !/^https:\/\/[^\s]+$/.test(endpoint)) throw Error('endpoint');
        for (const [value, size] of sizes) if (!value || new Uint8Array(value).length !== size) throw Error('keys');
        if (new Uint8Array(p256dh)[0] !== 4) throw Error('keys');
        if (typeof privateKey !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) throw Error('signing key');
        if (typeof page !== 'string' || !/^https:\/\/[\x21-\x7e]+$/.test(page)) throw Error('page');
        const data = { e: endpoint, p: b64url(p256dh), a: b64url(auth), k: privateKey, u: page, n: String(device || '').slice(0, 40) };
        return PREFIX + b64url(utf8(JSON.stringify(data)));
    }
    function deviceLabel(agent, touchPoints) {
        agent = String(agent || '');
        if (/iPhone|iPod/.test(agent)) return 'iPhone';
        // iPadOS reports itself as a Mac; a Mac has no touch points.
        if (/iPad/.test(agent) || (/Macintosh/.test(agent) && touchPoints > 1)) return 'iPad';
        if (/Android/.test(agent)) return 'Android';
        if (/Macintosh/.test(agent)) return 'Mac';
        if (/Windows/.test(agent)) return 'Windows';
        return 'Browser';
    }
    /* Which screen the page shows.
       install  an iPhone / iPad in Safari: Web Push works only from the Home Screen icon (iOS 16.4+)
                https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/
       old      no push support in this browser (iOS below 16.4, an in-app browser)
       blocked  the user refused notifications; only the system settings can change that
       ready    notifications can be enabled / are enabled */
    function pageState({ device, standalone, supported, permission }) {
        const apple = device === 'iPhone' || device === 'iPad';
        if (apple && !standalone) return 'install';
        if (!supported) return 'old';
        if (permission === 'denied') return 'blocked';
        return 'ready';
    }
    const api = { PREFIX, b64url, buildCode, deviceLabel, pageState };
    if (typeof module !== 'undefined') module.exports = api;
    else globalThis.AlertPageCore = api;
})();
