/* Alert page: registers this device for Web Push and shows its connection code.

   Everything happens on the device. The page makes a signing key pair (VAPID, RFC 8292), subscribes with the
   public half and shows one code holding the subscription and the private half. Nothing is sent anywhere by this
   page: the user carries the code to the PC apps, which then post notifications to the device's push service.
   The private half stays in this page's own storage so the code can be shown again. */
(() => {
    'use strict';
    const core = globalThis.AlertPageCore;
    const KEY = 'alerts:signing-key:v1';
    const $ = id => document.getElementById(id);
    const message = text => { $('message').textContent = text || ''; };
    const device = core.deviceLabel(navigator.userAgent, navigator.maxTouchPoints);
    const standalone = navigator.standalone === true || (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!(globalThis.crypto && crypto.subtle);
    const page = new URL('./', location.href).href;
    let busy = false, resetArmed = null;

    function show(view) {
        for (const section of document.querySelectorAll('[data-view]')) section.hidden = section.dataset.view !== view;
    }
    function savedKey() {
        try {
            const value = JSON.parse(localStorage.getItem(KEY));
            return value && typeof value.d === 'string' && typeof value.pub === 'string' ? value : null;
        } catch { return null; }
    }
    async function subscription() {
        const registration = await navigator.serviceWorker.getRegistration('./');
        return registration ? registration.pushManager.getSubscription() : null;
    }
    // The code of the current subscription, or null when there is none or its signing key is no longer stored here.
    async function currentCode() {
        const sub = await subscription(), key = savedKey();
        if (!sub) return { sub: null, code: null };
        const serverKey = sub.options && sub.options.applicationServerKey;
        if (!key || (serverKey && core.b64url(serverKey) !== key.pub)) return { sub, code: null };
        return { sub, code: core.buildCode({ endpoint: sub.endpoint, p256dh: sub.getKey('p256dh'), auth: sub.getKey('auth'), privateKey: key.d, page, device }) };
    }
    async function render() {
        const state = core.pageState({ device, standalone, supported, permission: supported ? Notification.permission : 'default' });
        if (state !== 'ready') { show(state); return; }
        let current = { sub: null, code: null };
        try { current = await currentCode(); } catch { /* shown as not enabled */ }
        if (current.code && Notification.permission === 'granted') {
            $('code').value = current.code;
            $('share').hidden = typeof navigator.share !== 'function';
            show('enabled');
        } else show(current.sub ? 'lost' : 'ready');
    }
    async function enable() {
        if (busy) return;
        busy = true; message('');
        try {
            // Asked first and directly from the tap: Safari only shows the question in response to one.
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') { message(permission === 'denied' ? '알림이 허용되지 않았습니다.' : ''); return; }
            const registration = await navigator.serviceWorker.register('sw.js', { scope: './' });
            await navigator.serviceWorker.ready;
            const old = await registration.pushManager.getSubscription();
            if (old) await old.unsubscribe();
            const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']);
            const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
            const privateKey = (await crypto.subtle.exportKey('jwk', pair.privateKey)).d;
            const sub = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: publicKey });
            try { localStorage.setItem(KEY, JSON.stringify({ d: privateKey, pub: core.b64url(publicKey) })); }
            catch {
                // Without storage the code could not be shown again: do not leave a subscription nobody can use.
                await sub.unsubscribe();
                throw Error('storage');
            }
            message('연결 코드가 만들어졌습니다.');
        } catch (error) {
            message(error && error.message === 'storage' ? '이 기기에 저장할 수 없어 코드를 만들지 못했습니다. 사생활 보호 모드라면 해제해 주세요.'
                : '알림을 켜지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
        } finally {
            busy = false;
            await render();
        }
    }
    async function reset() {
        if (busy) return;
        const button = $('reset');
        if (resetArmed === null) {
            button.textContent = 'SURE?';
            resetArmed = setTimeout(() => { resetArmed = null; button.textContent = 'RESET'; }, 3000);
            return;
        }
        clearTimeout(resetArmed); resetArmed = null; button.textContent = 'RESET';
        busy = true;
        try {
            const sub = await subscription();
            if (sub) await sub.unsubscribe();
            localStorage.removeItem(KEY);
            $('code').value = '';
            message('이전 코드는 이제 쓸 수 없습니다. ENABLE로 새 코드를 만드세요.');
        } catch { message('초기화하지 못했습니다. 잠시 뒤 다시 시도해 주세요.'); }
        finally { busy = false; await render(); }
    }
    async function copy() {
        const area = $('code');
        try { await navigator.clipboard.writeText(area.value); message('복사했습니다.'); }
        catch {
            area.focus(); area.select();
            message(document.execCommand && document.execCommand('copy') ? '복사했습니다.' : '코드를 길게 눌러 직접 복사해 주세요.');
        }
    }
    async function share() {
        try { await navigator.share({ text: $('code').value }); } catch { /* closed by the user */ }
    }
    $('enable').addEventListener('click', enable);
    $('renew').addEventListener('click', enable);
    $('reset').addEventListener('click', reset);
    $('copy').addEventListener('click', copy);
    $('share').addEventListener('click', share);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !busy) void render(); });
    void render();
})();
