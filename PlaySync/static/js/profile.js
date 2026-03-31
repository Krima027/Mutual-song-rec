// profile.js — connects profile.html to the real backend

// ── LOAD PROFILE STATS ────────────────────────────────────────

async function loadProfileStats() {
    try {
        var res  = await fetch('/api/me');
        var data = await res.json();
        var followingEl = document.getElementById('stat-following');
        var followersEl = document.getElementById('stat-followers');
        if (followingEl) followingEl.innerText = data.following || 0;
        if (followersEl) followersEl.innerText = data.followers || 0;
    } catch(e) {
        console.log('Could not load profile stats', e);
    }
}

// ── LOAD FOLLOWING LIST ───────────────────────────────────────

async function loadFollowingList() {
    var container = document.getElementById('following-list');
    if (!container) return;
    try {
        var res  = await fetch('/api/following');
        var list = await res.json();
        if (!list.length) {
            container.innerHTML = '<div style="color:#aaa;font-size:0.85rem;padding:6px 0;">You\'re not following anyone yet. Search above to find friends!</div>';
            return;
        }
        container.innerHTML = '';
        list.forEach(function(u) {
            var row = document.createElement('div');
            row.className = 'friend-row';
            row.innerHTML =
                '<div class="friend-icon"><i class="fas fa-user"></i><div class="status-dot" style="background:#1db954;"></div></div>' +
                '<div class="friend-info" style="flex:1;">' +
                    '<h4>' + escHtml(u.username) + '</h4>' +
                    '<p>@' + escHtml(u.username) + '</p>' +
                '</div>' +
                '<button onclick="unfollowUser(' + u.id + ', this)" ' +
                    'style="background:transparent;border:1px solid #555;color:#aaa;border-radius:8px;padding:4px 10px;cursor:pointer;font-size:0.75rem;">' +
                    'Unfollow' +
                '</button>';
            container.appendChild(row);
        });
    } catch(e) {
        container.innerHTML = '<div style="color:#aaa;font-size:0.85rem;">Could not load following list.</div>';
    }
}

// ── SEARCH & FOLLOW ───────────────────────────────────────────

window.searchAndFollow = async function() {
    var input = document.getElementById('friendSearchUsername');
    var result = document.getElementById('friendSearchResult');
    var username = (input ? input.value : '').trim();
    if (!username) return;

    result.innerHTML = '<span style="color:#aaa;font-size:0.85rem;">Searching...</span>';

    try {
        var res  = await fetch('/search-user?username=' + encodeURIComponent(username));
        var data = await res.json();

        if (data.error) {
            result.innerHTML = '<span style="color:#ef4444;font-size:0.85rem;"><i class="fas fa-times-circle"></i> ' + escHtml(data.error) + '</span>';
            return;
        }

        result.innerHTML =
            '<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:10px;background:var(--card-bg);border:1px solid var(--glass-border);">' +
                '<div style="width:38px;height:38px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;">' +
                    '<i class="fas fa-user" style="color:#aaa;"></i>' +
                '</div>' +
                '<div style="flex:1;">' +
                    '<div style="font-weight:700;font-size:0.9rem;">' + escHtml(data.username) + '</div>' +
                    '<div style="font-size:0.75rem;color:#aaa;">@' + escHtml(data.username) + '</div>' +
                '</div>' +
                (data.already_following
                    ? '<button onclick="unfollowUser(' + data.id + ', this)" style="border:1px solid #555;background:transparent;color:#aaa;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:0.8rem;">Unfollow</button>'
                    : '<button onclick="followUser(' + data.id + ', this)" style="background:var(--accent);border:none;color:#000;border-radius:8px;padding:6px 14px;cursor:pointer;font-weight:700;font-size:0.8rem;">Follow</button>'
                ) +
            '</div>';
    } catch(e) {
        result.innerHTML = '<span style="color:#ef4444;font-size:0.85rem;">Error. Try again.</span>';
    }
};

window.followUser = async function(userId, btn) {
    btn.disabled = true;
    btn.innerText = '...';
    try {
        var res  = await fetch('/follow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        var data = await res.json();
        if (data.error) {
            btn.innerText = data.error;
            btn.disabled = false;
        } else {
            btn.outerHTML = '<button onclick="unfollowUser(' + userId + ', this)" style="border:1px solid #555;background:transparent;color:#aaa;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:0.8rem;">Unfollow</button>';
            loadProfileStats();
            loadFollowingList();
        }
    } catch(e) {
        btn.innerText = 'Error';
        btn.disabled = false;
    }
};

window.unfollowUser = async function(userId, btn) {
    btn.disabled = true;
    btn.innerText = '...';
    try {
        var res  = await fetch('/unfollow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        });
        var data = await res.json();
        if (data.error) {
            btn.innerText = 'Unfollow';
            btn.disabled = false;
        } else {
            // Replace with Follow button (need to re-search to get it back)
            btn.outerHTML = '<button onclick="followUser(' + userId + ', this)" style="background:var(--accent);border:none;color:#000;border-radius:8px;padding:6px 14px;cursor:pointer;font-weight:700;font-size:0.8rem;">Follow</button>';
            loadProfileStats();
            loadFollowingList();
        }
    } catch(e) {
        btn.innerText = 'Unfollow';
        btn.disabled = false;
    }
};

// ── COPY USERNAME ─────────────────────────────────────────────

window.copyUsername = function() {
    var name = document.getElementById('userName');
    if (!name) return;
    navigator.clipboard.writeText(name.innerText).then(function() {
        alert('Username "' + name.innerText + '" copied! Share it with friends so they can follow you.');
    });
};

// ── HELPERS ───────────────────────────────────────────────────

function escHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// ── INIT ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
    loadProfileStats();
    loadFollowingList();
});
