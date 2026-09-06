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

    function canView(id, profile, authenticated) {
        if (!isProtected(id)) return true;
        if (!authenticated || !profile || profile.active !== true || profile.status !== 'active') return false;
        if (profile.grade === 'admin') return true;
        if (!Array.isArray(profile.subscriptions)) return false;
        return profile.subscriptions.some(plan => sections[id].includes(plan));
    }

    const policy = Object.freeze({ isProtected, canView, sections });
    if (typeof module !== 'undefined' && module.exports) module.exports = policy;
    root.ToolkitGuidePolicy = policy;
})(globalThis);

// The UI integration runs only in the website, after the existing member helpers.
if (typeof document !== 'undefined') {
    const guideAccessState = { verified: false, pending: '', request: null, requestToken: '', generation: 0 };

    window.canViewToolkitGuide = function (id) {
        return !ToolkitGuidePolicy.isProtected(id) || (guideAccessState.verified && memberProfileCacheIsFresh()
            && ToolkitGuidePolicy.canView(id, memberState.profile, Boolean(memberToken())));
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
        guideAccessState.verified = true;
        refreshToolkitGuideUI();
    };

    window.resetToolkitGuideAccess = function () {
        guideAccessState.verified = false;
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
        if (guideAccessState.verified && memberProfileCacheIsFresh()) return Promise.resolve(true);
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
                if (!result.ok || !result.profile) throw new Error('guide_profile_unavailable');
                cacheMemberProfile(result.profile);
                return true;
            } catch (error) {
                if (isCurrent()) {
                    guideAccessState.verified = false;
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
