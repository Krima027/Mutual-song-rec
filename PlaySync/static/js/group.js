// group.js — PlaySync Groups, fully wired to backend
// Design / HTML structure unchanged. All mock data replaced with real API calls.

// ── STATE ────────────────────────────────────────────────────
var selectedUsers  = [];   // [{id, username}]  people added to new group
var activeGroupId  = null; // currently open group

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function() {
    loadMyGroups();
});

// ── LOAD MY GROUPS FROM BACKEND ───────────────────────────────
async function loadMyGroups() {
    var container = document.getElementById('group-list-content');
    if (!container) return;
    try {
        var res    = await fetch('/api/my-groups');
        var groups = await res.json();
        container.innerHTML = '';

        if (!groups.length) {
            container.innerHTML = '<div style="color:#aaa;font-size:0.8rem;padding:16px;">No groups yet. Create one!</div>';
            return;
        }

        groups.forEach(function(grp) {
            var item = document.createElement('div');
            item.className = 'group-card-item';
            var hue = (grp.id * 57) % 360;   // deterministic color per group
            item.innerHTML =
                '<div class="g-avatar" style="background: linear-gradient(45deg, hsl(' + hue + ',60%,50%), hsl(' + ((hue+40)%360) + ',60%,50%));">' +
                    '<i class="fas fa-music"></i>' +
                '</div>' +
                '<div>' +
                    '<div style="font-weight:700;font-size:0.9rem;">' + escHtml(grp.name) + '</div>' +
                    '<div style="font-size:0.7rem;color:#aaa;">' + grp.member_count + ' Members</div>' +
                '</div>';
            item.onclick = function() { openGroup(grp.id, grp.name); };
            container.appendChild(item);
        });
    } catch(e) {
        container.innerHTML = '<div style="color:#aaa;font-size:0.8rem;padding:16px;">Could not load groups.</div>';
    }
}

// ── NAVIGATION ────────────────────────────────────────────────
function showCreateView() {
    document.getElementById('view-empty').style.display  = 'none';
    document.getElementById('view-active').style.display = 'none';
    document.getElementById('view-create').style.display = 'block';
    document.getElementById('newGroupName').value = '';
    document.getElementById('friendSearchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('selectedFriends').innerHTML = '';
    selectedUsers = [];
}

function cancelCreate() {
    document.getElementById('view-create').style.display = 'none';
    document.getElementById('view-empty').style.display  = 'flex';
}

// ── OPEN A GROUP ──────────────────────────────────────────────
async function openGroup(groupId, groupName) {
    activeGroupId = groupId;

    document.getElementById('view-empty').style.display  = 'none';
    document.getElementById('view-create').style.display = 'none';
    document.getElementById('view-active').style.display = 'flex';

    document.getElementById('activeGroupName').innerText = groupName || 'Group';

    // Load members
    try {
        var res     = await fetch('/api/group/' + groupId + '/members');
        var members = await res.json();
        var names   = members.map(function(m) { return '@' + m.username; }).join(', ');
        document.getElementById('activeGroupMembers').innerText = names + ' • Active Jam';
    } catch(e) {
        document.getElementById('activeGroupMembers').innerText = 'Members • Active Jam';
    }

    // Load mutual playlist (ML) and show — but DON'T auto-play
    loadMutualPlaylist(groupId);

    // Reset chat
    loadChat(groupId);
}

// ── CREATE GROUP ──────────────────────────────────────────────
window.finalizeGroup = async function() {
    var name = document.getElementById('newGroupName').value.trim();
    if (!name) { alert('Please name your group!'); return; }
    if (!selectedUsers.length) { alert('Add at least one person!'); return; }

    var btn = document.querySelector('#view-create .btn-primary[onclick="finalizeGroup()"]');
    if (btn) { btn.disabled = true; btn.innerText = 'Creating...'; }

    try {
        var res  = await fetch('/create-group', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: name,
                member_ids: selectedUsers.map(function(u) { return u.id; })
            })
        });
        var data = await res.json();
        if (data.error) {
            alert(data.error);
            if (btn) { btn.disabled = false; btn.innerText = 'Create Jam'; }
            return;
        }
        await loadMyGroups();
        openGroup(data.group_id, data.name);
    } catch(e) {
        alert('Could not create group. Try again.');
        if (btn) { btn.disabled = false; btn.innerText = 'Create Jam'; }
    }
};

// ── SEARCH USERS (real API) ───────────────────────────────────
var searchTimer = null;

window.searchFriends = function() {
    var input = document.getElementById('friendSearchInput').value.trim();
    var resultsBox = document.getElementById('searchResults');
    clearTimeout(searchTimer);
    resultsBox.innerHTML = '';
    resultsBox.style.display = 'none';
    if (!input) return;

    searchTimer = setTimeout(async function() {
        try {
            var res  = await fetch('/search-user?username=' + encodeURIComponent(input));
            var data = await res.json();
            resultsBox.innerHTML = '';

            if (data.error) {
                resultsBox.style.display = 'block';
                resultsBox.innerHTML = '<div class="search-res-item" style="color:#aaa;">' + escHtml(data.error) + '</div>';
                return;
            }

            // Check not already added
            var alreadyAdded = selectedUsers.some(function(u) { return u.id === data.id; });
            resultsBox.style.display = 'block';
            var div = document.createElement('div');
            div.className = 'search-res-item';
            div.innerHTML = '<span>@' + escHtml(data.username) + '</span>' +
                (alreadyAdded ? '<span style="color:#aaa;font-size:0.75rem;">Added</span>' : '<i class="fas fa-plus"></i>');
            if (!alreadyAdded) {
                div.onclick = function() { addUserToSelection(data); };
            }
            resultsBox.appendChild(div);
        } catch(e) {
            resultsBox.innerHTML = '';
        }
    }, 400);
};

function addUserToSelection(user) {
    if (selectedUsers.some(function(u) { return u.id === user.id; })) return;
    selectedUsers.push(user);
    document.getElementById('friendSearchInput').value = '';
    document.getElementById('searchResults').innerHTML = '';
    document.getElementById('searchResults').style.display = 'none';
    renderSelectedFriends();
}

function renderSelectedFriends() {
    var container = document.getElementById('selectedFriends');
    container.innerHTML = selectedUsers.map(function(u) {
        return '<div class="friend-chip">@' + escHtml(u.username) +
            ' <i class="fas fa-times" style="cursor:pointer;" onclick="removeUser(' + u.id + ')"></i></div>';
    }).join('');
}

window.removeFriend = function(name) {};   // legacy stub
window.removeUser = function(id) {
    selectedUsers = selectedUsers.filter(function(u) { return u.id !== id; });
    renderSelectedFriends();
};

// ── MUTUAL PLAYLIST (ML) ─────────────────────────────────────

async function loadMutualPlaylist(groupId) {
    var trackList = document.getElementById('jamTrackList');
    if (!trackList) return;
    trackList.innerHTML = '<div style="color:#aaa;font-size:0.85rem;padding:20px;text-align:center;"><i class="fas fa-magic" style="margin-right:8px;"></i>Analysing everyone\'s music taste...</div>';

    try {
        var res   = await fetch('/api/group/' + groupId + '/mutual-songs');
        var songs = await res.json();

        if (songs.error || !songs.length) {
            trackList.innerHTML = '<div style="color:#aaa;font-size:0.85rem;padding:20px;text-align:center;">No mutual songs found yet. Members need to log in so their history can be compared!</div>';
            return;
        }

        // Store as queue but DON'T auto-play — user must press Play
        window._groupQueue      = songs;
        window._groupQueueIndex = -1;   // -1 = nothing playing yet

        trackList.innerHTML = '';
        songs.forEach(function(song, i) {
            var div = document.createElement('div');
            div.className = 'jam-track';
            div.id = 'jt-' + i;

            var sharedLabel = song.shared_by + '/' + song.total_members + ' members';
            var imgHtml = song.image
                ? '<img src="' + song.image + '" style="width:36px;height:36px;border-radius:6px;object-fit:cover;flex-shrink:0;">'
                : '<div style="width:36px;height:36px;border-radius:6px;background:#333;flex-shrink:0;"></div>';

            div.innerHTML =
                imgHtml +
                '<div class="jt-info" style="flex:1;overflow:hidden;">' +
                    '<h5 style="margin:0;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escHtml(song.title) + '</h5>' +
                    '<span style="font-size:0.72rem;color:#aaa;">' + escHtml(song.artist) + ' · <span style="color:var(--accent);">' + sharedLabel + '</span></span>' +
                '</div>' +
                '<i class="fas fa-play" style="font-size:0.8rem;color:#aaa;flex-shrink:0;" id="jt-icon-' + i + '"></i>';

            div.onclick = function() { playGroupSong(i); };
            trackList.appendChild(div);
        });

        // Wire the big play button in the playlist header
        var bigPlay = document.querySelector('.playlist-controls .fa-play-circle');
        if (bigPlay) {
            bigPlay.parentElement.onclick = function() { playGroupSong(0); };
            bigPlay.parentElement.style.cursor = 'pointer';
        }

    } catch(e) {
        trackList.innerHTML = '<div style="color:#aaa;font-size:0.85rem;padding:20px;">Could not generate playlist.</div>';
    }
}

// Play a song from the group mutual list
function playGroupSong(index) {
    var songs = window._groupQueue;
    if (!songs || index >= songs.length) return;

    var song = songs[index];

    // Highlight active track
    if (window._groupQueueIndex >= 0) {
        var old = document.getElementById('jt-icon-' + window._groupQueueIndex);
        if (old) { old.classList.remove('fa-pause'); old.classList.add('fa-play'); old.style.color = '#aaa'; }
    }
    window._groupQueueIndex = index;
    var icon = document.getElementById('jt-icon-' + index);
    if (icon) { icon.classList.remove('fa-play'); icon.classList.add('fa-pause'); icon.style.color = 'var(--accent)'; }

    // Use the global player from home.js
    if (window.playSong) {
        window.playSong({
            song_id: song.song_id,
            title:   song.title,
            artist:  song.artist,
            image:   song.image,
        });
        // After this song ends, auto-advance
        var audioEl = document.getElementById('audio');
        if (audioEl) {
            audioEl.onended = function() {
                var next = index + 1;
                if (next < songs.length) playGroupSong(next);
            };
        }
    }

    // Set global queue so prev/next arrows work
    window._queue = songs.map(function(s) {
        return { song_id: s.song_id, title: s.title, artist: s.artist, image: s.image };
    });
    window._queueIndex = index;
}

// ── CHAT ──────────────────────────────────────────────────────
function loadChat(groupId) {
    var chat = document.getElementById('chatWindow');
    if (!chat) return;
    chat.innerHTML =
        '<div class="c-msg inc"><span class="sender-name">System</span>Jam started! Mutual playlist generated based on everyone\'s taste.</div>';
}

window.sendMessage = function() {
    var input = document.getElementById('chatInput');
    var txt   = input ? input.value.trim() : '';
    if (!txt) return;
    var chat  = document.getElementById('chatWindow');

    var myMsg = document.createElement('div');
    myMsg.className = 'c-msg out';
    myMsg.innerText = txt;
    chat.appendChild(myMsg);
    input.value = '';
    chat.scrollTop = chat.scrollHeight;
};

// ── HELPERS ───────────────────────────────────────────────────
function escHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}
