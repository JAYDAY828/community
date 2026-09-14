/* Display-level guide access. The member server remains the source of account state.
 * Guide HTML is still shipped locally; this is not a server authorization boundary.
 * Keep the policy separate so a future content endpoint can use the same section IDs.
 */
(function (root) {
    'use strict';
    const sections = Object.freeze({
        apikey: ['extension', 'detector', 'all'],
        detector: ['detector', 'all'],
        preview: ['detector', 'all'],
        toolkit: ['all'],
        trades: ['all'],
        orderbook: ['all'],
        extensions: ['extension', 'all']
    });

    function isProtected(id) {
        return Object.prototype.hasOwnProperty.call(sections, id);
    }

    function normalize(value) {
        return typeof value === 'string' ? value.trim().toLowerCase() : '';
    }

    function canView(id, profile, authenticated) {
        if (!isProtected(id)) return true;
        if (!authenticated || !profile || profile.active !== true || normalize(profile.status) !== 'active') return false;
        if (normalize(profile.grade) === 'admin') return true;
        // Prefer the explicit entitlement list, including an explicitly empty list.
        // Older profile responses expose only the singular subscription field.
        const plans = Array.isArray(profile.subscriptions) ? profile.subscriptions
            : profile.subscriptions == null && typeof profile.subscription === 'string'
                ? profile.subscription.split(/[,;\/\s]+/) : [];
        return plans.some(plan => sections[id].includes(normalize(plan)));
    }

    const policy = Object.freeze({ isProtected, canView, sections });
    if (typeof module !== 'undefined' && module.exports) module.exports = policy;
    root.ToolkitGuidePolicy = policy;
})(globalThis);

// The UI integration runs only in the website, after the existing member helpers.
if (typeof document !== 'undefined') {
    const GUIDE_CACHE_KEY = 'toolkit-guide-access-v1';
    const GUIDE_CACHE_MAX_AGE_MS = 5 * 60 * 1000;
    const guideAccessState = { verified: false, profile: null, verifiedAt: 0, token: '', pending: '', request: null, requestToken: '', generation: 0 };

    function cacheUsable() {
        const age = Date.now() - guideAccessState.verifiedAt;
        const token = memberToken();
        if (!guideAccessState.verified || !token || token !== guideAccessState.token
            || !Number.isFinite(age) || age < 0 || age >= GUIDE_CACHE_MAX_AGE_MS) return false;
        // The server verifies signatures; this only prevents displaying cached access past expiry.
        try {
            const payload = JSON.parse(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')));
            if (Number.isFinite(payload.exp) && Date.now() >= payload.exp * 1000) return false;
        } catch (_) { /* Unknown token formats still require server verification and the short cache bound. */ }
        const expiration = String(guideAccessState.profile?.expiration || '').trim();
        const match = expiration.match(/^(\d{4})[\/.-](\d{1,2})[\/.-](\d{1,2})/);
        if (match) {
            const end = Date.UTC(+match[1], +match[2] - 1, +match[3] + 1) - 9 * 3600000;
            if (Date.now() >= end) return false;
        }
        return true;
    }

    function restoreGuideCache() {
        try {
            const saved = JSON.parse(sessionStorage.getItem(GUIDE_CACHE_KEY));
            if (!saved || saved.token !== memberToken()) return;
            Object.assign(guideAccessState, { verified: true, token: saved.token,
                profile: saved.profile, verifiedAt: saved.verifiedAt });
            if (!cacheUsable()) guideAccessState.verified = false;
        } catch (_) { /* Storage is optional; server verification remains available. */ }
    }

    window.canViewToolkitGuide = function (id) {
        return !ToolkitGuidePolicy.isProtected(id) || (cacheUsable()
            && ToolkitGuidePolicy.canView(id, guideAccessState.profile, Boolean(memberToken())));
    };

    window.refreshToolkitGuideUI = function () {
        const active = document.querySelector('.guide-section:not(.hidden)');
        const mustLeave = active && !canViewToolkitGuide(active.id);
        document.querySelectorAll('[data-guide-section]').forEach(element => {
            const allowed = canViewToolkitGuide(element.dataset.guideSection);
            if (element.classList.contains('guide-section')) {
                if (!allowed) element.classList.add('hidden');
            } else {
                element.hidden = !allowed;
            }
        });
        if (mustLeave) activate('overview', { syncHash: true });
        document.getElementById('searchResults')?.classList.add('hidden');
    };

    window.acceptToolkitGuideProfile = function () {
        const profile = memberState.profile;
        guideAccessState.profile = profile && { active: profile.active, status: profile.status,
            grade: profile.grade, subscription: profile.subscription,
            subscriptions: profile.subscriptions, expiration: profile.expiration };
        guideAccessState.verified = Boolean(profile);
        guideAccessState.verifiedAt = Date.now();
        guideAccessState.token = memberToken();
        try {
            sessionStorage.setItem(GUIDE_CACHE_KEY, JSON.stringify({ token: guideAccessState.token,
                profile: guideAccessState.profile, verifiedAt: guideAccessState.verifiedAt }));
        } catch (_) { /* In-memory access still works when storage is unavailable. */ }
        refreshToolkitGuideUI();
    };

    window.resetToolkitGuideAccess = function () {
        guideAccessState.verified = false;
        guideAccessState.profile = null;
        guideAccessState.verifiedAt = 0;
        guideAccessState.token = '';
        try { sessionStorage.removeItem(GUIDE_CACHE_KEY); } catch (_) {}
        guideAccessState.generation += 1;
        guideAccessState.request = null;
        guideAccessState.requestToken = '';
        refreshToolkitGuideUI();
    };

    window.cancelPendingToolkitGuide = function () {
        guideAccessState.pending = '';
        document.getElementById('guide-access-notice')?.classList.add('hidden');
    };

    function guideAccessMessage() {
        if (!memberToken()) return currentLang === 'ko'
            ? '상세 사용 가이드는 로그인 후 이용 권한에 따라 열립니다.'
            : 'Sign in to view the guides included in your access.';
        if (!guideAccessState.verified) return currentLang === 'ko'
            ? '이용 권한을 확인하지 못했습니다. 마이페이지에서 다시 확인해 주세요.'
            : 'Access could not be verified. Please check again in My Page.';
        return currentLang === 'ko'
            ? '선택한 가이드는 해당 툴킷의 이용 권한이 필요합니다. 마이페이지에서 플랜과 이용 상태를 확인할 수 있습니다.'
            : 'This guide requires access to the toolkit. Check your plan and status in My Page.';
    }

    window.resumePendingToolkitGuide = function () {
        const id = guideAccessState.pending;
        if (!id) return;
        if (canViewToolkitGuide(id)) {
            guideAccessState.pending = '';
            closeMemberModal();
            activate(id);
        } else {
            setMemberMessage('profile', guideAccessMessage(), 'info');
        }
    };

    window.ensureToolkitGuideProfile = function () {
        const token = memberToken();
        if (!token) return Promise.resolve(false);
        if (cacheUsable() && memberProfileCacheIsFresh()) return Promise.resolve(true);
        if (guideAccessState.request && guideAccessState.requestToken === token) return guideAccessState.request;
        const sessionGeneration = memberState.sessionGeneration;
        const generation = guideAccessState.generation;
        guideAccessState.requestToken = token;
        const isCurrent = () => token === memberToken()
            && sessionGeneration === memberState.sessionGeneration && generation === guideAccessState.generation;
        const request = (async () => {
            try {
                const result = await memberApi('profile', { token });
                if (!isCurrent()) return false;
                if (!result.ok || !result.profile) throw new Error(result.error || 'guide_profile_unavailable');
                cacheMemberProfile(result.profile);
                return true;
            } catch (error) {
                if (isCurrent()) {
                    if (['invalid_session', 'account_not_found'].includes(error.message)) {
                        resetToolkitGuideAccess();
                    } else if (!cacheUsable()) {
                        guideAccessState.verified = false;
                    }
                    refreshToolkitGuideUI();
                }
                return false;
            } finally {
                if (isCurrent()) {
                    guideAccessState.request = null;
                    guideAccessState.requestToken = '';
                }
            }
        })();
        guideAccessState.request = request;
        return request;
    };

    window.blockToolkitGuideRoute = function (id) {
        guideAccessState.pending = id;
        activate('overview');
        const notice = document.getElementById('guide-access-notice');
        const message = document.getElementById('guide-access-message');
        if (notice && message) {
            message.textContent = guideAccessMessage();
            notice.classList.remove('hidden');
        }
        if (memberToken()) {
            const generation = guideAccessState.generation;
            ensureToolkitGuideProfile().then(() => {
                if (generation !== guideAccessState.generation || guideAccessState.pending !== id) return;
                if (canViewToolkitGuide(id)) {
                    guideAccessState.pending = '';
                    activate(id);
                } else if (message) message.textContent = guideAccessMessage();
            });
        }
    };

    window.requestToolkitGuide = async function (id) {
        if (!ToolkitGuidePolicy.isProtected(id)) return;
        guideAccessState.pending = id;
        if (!memberToken()) {
            openMemberModal('login');
            setMemberMessage('auth', guideAccessMessage(), 'info');
            return;
        }
        if (canViewToolkitGuide(id)) {
            guideAccessState.pending = '';
            closeMemberModal();
            activate(id);
            // Keep navigation responsive; a fresh server response still updates or revokes access.
            void ensureToolkitGuideProfile();
            return;
        }
        await ensureToolkitGuideProfile();
        if (guideAccessState.pending !== id) return;
        if (canViewToolkitGuide(id)) {
            guideAccessState.pending = '';
            closeMemberModal();
            activate(id);
        } else {
            openMemberModal('profile');
        }
    };

    window.openPendingToolkitGuide = function () {
        requestToolkitGuide(guideAccessState.pending || 'apikey');
    };

    restoreGuideCache();

    document.addEventListener('DOMContentLoaded', () => {
        refreshToolkitGuideUI();
        if (memberToken()) ensureToolkitGuideProfile();
    });
    window.addEventListener('hashchange', () => {
        const route = getRouteTargetFromHash();
        if (!ToolkitGuidePolicy.isProtected(route.sectionId) && route.sectionId !== 'overview') cancelPendingToolkitGuide();
    });
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && memberToken()) ensureToolkitGuideProfile();
    });
}
