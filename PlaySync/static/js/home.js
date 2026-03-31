// PlaySync home.js — yt-dlp audio player (no YouTube iframe)

// --- DOM ---
var body          = document.body;
var sidebar       = document.getElementById('sidebar');
var themeIcon     = document.getElementById('theme-icon');
var playIcon      = document.getElementById('playIcon');
var pTitle        = document.getElementById('p-title');
var pArtist       = document.getElementById('p-artist');
var pImg          = document.getElementById('p-img');
var trackFill     = document.getElementById('track-fill');
var currentTimeEl = document.getElementById('current-time');
var totalTimeEl   = document.getElementById('total-time');
var audio         = document.getElementById('audio');

// --- STATE ---
var isPlaying   = false;
var currentSong = null;
var searchTimer = null;

// ── PLAY A SONG ────────────────────────────────────────────

window.playSong = async function(song) {
    currentSong = song;

    // Update UI immediately
    if (pTitle)  pTitle.innerText  = (song.title  || 'Loading...');
    if (pArtist) pArtist.innerText = (song.artist || '');
    if (pImg) {
        if (song.image) {
            pImg.style.backgroundImage = 'url(' + song.image + ')';
            pImg.innerHTML = '';
        } else {
            pImg.style.backgroundImage = '';
            pImg.innerHTML = '<i class="fas fa-music" style="color:#555;font-size:1.3rem;"></i>';
        }
    }
    document.getElementById('player').dataset.songId = song.song_id || '';

    // Stop current
    audio.pause();
    audio.src = '';
    isPlaying = false;
    if (playIcon) { playIcon.classList.remove('fa-pause'); playIcon.classList.add('fa-play'); }

    // Show loading
    if (pTitle) pTitle.innerText = (song.title || '') + ' ⏳';

    var query = (song.title || '') + ' ' + (song.artist || '');

    try {
        var res  = await fetch('/api/stream?q=' + encodeURIComponent(query));
        var data = await res.json();

        if (data.error || !data.url) {
            console.error('Stream error from server:', data.error);
            if (pTitle) pTitle.innerText = (song.title || '') + ' — ' + (data.error || 'not found');
            return;
        }

        // Restore title
        if (pTitle)  pTitle.innerText  = song.title  || data.title || '';
        if (pArtist) pArtist.innerText = song.artist || '';

        // Audio is proxied through Flask — no CORS issues
        audio.innerHTML = '';
        audio.src = data.url;  // always /api/proxy-audio
        audio.load();
        audio.play().then(function() {
            isPlaying = true;
            if (playIcon) { playIcon.classList.remove('fa-play'); playIcon.classList.add('fa-pause'); }
        }).catch(function(err) {
            console.error('Audio play() error:', err);
            if (pTitle) pTitle.innerText = (song.title || '') + ' (playback error)';
        });

    } catch(err) {
        console.error('Fetch /api/stream failed:', err);
        if (pTitle) pTitle.innerText = (song.title || '') + ' (connection error)';
    }
};

// ── CONTROLS ──────────────────────────────────────────────

window.togglePlay = function() {
    if (!audio.src) return;
    if (isPlaying) {
        audio.pause();
        isPlaying = false;
        if (playIcon) { playIcon.classList.remove('fa-pause'); playIcon.classList.add('fa-play'); }
    } else {
        audio.play();
        isPlaying = true;
        if (playIcon) { playIcon.classList.remove('fa-play'); playIcon.classList.add('fa-pause'); }
    }
};

window.playNext = function() {
    // Next song from queue if available
    if (window._queue && window._queueIndex < window._queue.length - 1) {
        window._queueIndex++;
        window.playSong(window._queue[window._queueIndex]);
    }
};

window.playPrev = function() {
    // Restart if more than 3s in, else previous
    if (audio.currentTime > 3) {
        audio.currentTime = 0;
        return;
    }
    if (window._queue && window._queueIndex > 0) {
        window._queueIndex--;
        window.playSong(window._queue[window._queueIndex]);
    }
};

window.seek = function(e) {
    if (!audio.duration) return;
    var pct = e.offsetX / e.currentTarget.offsetWidth;
    audio.currentTime = pct * audio.duration;
    if (trackFill) trackFill.style.width = (pct * 100) + '%';
};

window.setVolume = function(v) {
    audio.volume = parseInt(v) / 100;
};

// ── AUDIO EVENTS ──────────────────────────────────────────

audio.ontimeupdate = function() {
    if (!audio.duration) return;
    var pct = (audio.currentTime / audio.duration) * 100;
    if (trackFill)     trackFill.style.width   = pct + '%';
    if (currentTimeEl) currentTimeEl.innerText = fmt(audio.currentTime);
};

audio.onloadedmetadata = function() {
    if (totalTimeEl) totalTimeEl.innerText = fmt(audio.duration);
};

audio.onended = function() {
    isPlaying = false;
    if (playIcon) { playIcon.classList.remove('fa-pause'); playIcon.classList.add('fa-play'); }
    if (trackFill) trackFill.style.width = '0%';
};

audio.onerror = function() {
    if (pTitle && currentSong) pTitle.innerText = (currentSong.title || '') + ' (error)';
    isPlaying = false;
    if (playIcon) { playIcon.classList.remove('fa-pause'); playIcon.classList.add('fa-play'); }
};

function fmt(s) {
    if (!s || isNaN(s)) return '0:00';
    var m   = Math.floor(s / 60);
    var sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
}

// ── SEARCH DROPDOWN ───────────────────────────────────────

window.handleSearch = function(e) {
    var q = document.getElementById('global-search').value.trim();
    clearTimeout(searchTimer);
    closeDropdown();
    if (!q) return;
    searchTimer = setTimeout(function() { doSearch(q); }, 400);
};

async function doSearch(query) {
    showDropdownLoading();
    try {
        var res    = await fetch('/api/search-tracks?q=' + encodeURIComponent(query));
        var tracks = await res.json();
        if (!Array.isArray(tracks) || !tracks.length) {
            showDropdownEmpty();
            return;
        }
        renderDropdown(tracks);
    } catch(e) {
        closeDropdown();
    }
}

function showDropdownLoading() {
    closeDropdown();
    var box = makeBox();
    var row = document.createElement('div');
    row.style.padding = '14px 16px';
    row.innerHTML = '<span style="color:#aaa;font-size:0.85rem;">Searching...</span>';
    box.appendChild(row);
    attachBox(box);
}

function showDropdownEmpty() {
    closeDropdown();
    var box = makeBox();
    var row = document.createElement('div');
    row.style.padding = '14px 16px';
    row.innerHTML = '<span style="color:#aaa;font-size:0.85rem;">No results found</span>';
    box.appendChild(row);
    attachBox(box);
}

function renderDropdown(tracks) {
    closeDropdown();
    var box = makeBox();
    tracks.forEach(function(track) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 16px;cursor:pointer;border-bottom:1px solid var(--glass-border);';
        row.onmouseover = function() { row.style.background = 'var(--card-hover)'; };
        row.onmouseout  = function() { row.style.background = 'transparent'; };
        var img = track.image
            ? '<img src="' + track.image + '" style="width:40px;height:40px;border-radius:8px;object-fit:cover;flex-shrink:0;">'
            : '<div style="width:40px;height:40px;border-radius:8px;background:#333;flex-shrink:0;"></div>';
        row.innerHTML = img +
            '<div style="flex:1;overflow:hidden;">' +
                '<div style="font-weight:600;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + track.title + '</div>' +
                '<div style="font-size:0.75rem;color:#aaa;">' + track.artist + '</div>' +
            '</div>' +
            '<i class="fas fa-play" style="color:#aaa;font-size:0.75rem;flex-shrink:0;"></i>';
        row.addEventListener('click', function() {
            document.getElementById('global-search').value = track.title;
            closeDropdown();
            window.playSong(track);
        });
        box.appendChild(row);
    });
    attachBox(box);
}

function makeBox() {
    var box = document.createElement('div');
    box.id = 'search-dropdown';
    box.style.cssText = [
        'position:absolute','top:58px','left:50%','transform:translateX(-50%)',
        'width:420px','background:var(--card-bg)',
        'border:1px solid var(--glass-border)','border-radius:14px',
        'z-index:9999','box-shadow:0 20px 40px rgba(0,0,0,0.5)',
        'overflow:hidden','max-height:360px','overflow-y:auto'
    ].join(';');
    return box;
}

function attachBox(box) {
    var header = document.querySelector('header');
    if (header) { header.style.position = 'relative'; header.appendChild(box); }
    setTimeout(function() { document.addEventListener('click', outsideClose); }, 100);
}

function outsideClose(e) {
    if (!e.target.closest('#search-dropdown') && !e.target.closest('#global-search')) {
        closeDropdown();
        document.removeEventListener('click', outsideClose);
    }
}

function closeDropdown() {
    var d = document.getElementById('search-dropdown');
    if (d) d.remove();
}

// ── SIDEBAR & THEME ───────────────────────────────────────

function toggleSidebar() { if (sidebar) sidebar.classList.toggle('active'); }

function toggleTheme() {
    body.classList.toggle('light-mode');
    if (body.classList.contains('light-mode')) {
        if (themeIcon) { themeIcon.classList.remove('fa-moon'); themeIcon.classList.add('fa-sun'); }
    } else {
        if (themeIcon) { themeIcon.classList.remove('fa-sun'); themeIcon.classList.add('fa-moon'); }
    }
}

// ── LIKE BUTTON ───────────────────────────────────────────

var likeBtn = document.getElementById('like-btn');
if (likeBtn) {
    likeBtn.addEventListener('click', function() {
        likeBtn.classList.toggle('fas');
        likeBtn.classList.toggle('far');
    });
}

// ── ON LOAD ───────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function() {
    loadTopArtists();
    loadPlaylists();
    loadRecentlyPlayed();
});

// ── DATA LOADERS ──────────────────────────────────────────

async function loadTopArtists() {
    var container = document.getElementById('favorite-artists');
    if (!container) return;
    try {
        var res  = await fetch('/api/top-artists');
        var data = await res.json();
        if (!Array.isArray(data) || !data.length) {
            container.innerHTML = '<div style="color:#aaa;font-size:0.85rem;">No top artists yet.</div>';
            return;
        }
        container.innerHTML = '';
        container.style.cssText = 'display:flex;flex-direction:column;gap:6px;width:100%;';
        data.forEach(function(artist) {
            var div = document.createElement('div');
            div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:8px;border-radius:10px;cursor:pointer;transition:background 0.2s;';
            div.onmouseover = function() { div.style.background = 'var(--card-hover)'; };
            div.onmouseout  = function() { div.style.background = 'transparent'; };
            var imgHtml = artist.image
                ? '<img src="' + artist.image + '" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0;">'
                : '<div style="width:44px;height:44px;border-radius:50%;background:#333;flex-shrink:0;"></div>';
            div.innerHTML = imgHtml +
                '<div style="overflow:hidden;">' +
                    '<div style="font-weight:600;font-size:0.9rem;">' + artist.name + '</div>' +
                    '<div style="font-size:0.7rem;color:#aaa;">' + ((artist.genres || []).join(', ') || 'Artist') + '</div>' +
                '</div>';
            container.appendChild(div);
        });
    } catch(e) {
        container.innerHTML = '<div style="color:#aaa;font-size:0.85rem;">Could not load artists.</div>';
    }
}

async function loadPlaylists() {
    var container = document.getElementById('playlistContainer');
    if (!container) return;
    try {
        var res  = await fetch('/api/playlists');
        var data = await res.json();
        if (!Array.isArray(data) || !data.length) {
            container.innerHTML = '<div style="color:#aaa;font-size:0.85rem;">No playlists found.</div>';
            return;
        }
        container.innerHTML = '';
        data.forEach(function(pl) {
            var card = document.createElement('div');
            card.className = 'playlist-card';
            card.style.cssText = 'cursor:pointer;width:120px;text-align:center;flex-shrink:0;';
            var imgHtml = pl.image
                ? '<img src="' + pl.image + '" style="width:100%;border-radius:8px;margin-bottom:6px;aspect-ratio:1;object-fit:cover;">'
                : '<div style="width:100%;aspect-ratio:1;border-radius:8px;background:#333;margin-bottom:6px;"></div>';
            card.innerHTML = imgHtml +
                '<div style="font-size:0.8rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + pl.name + '</div>' +
                '<div style="font-size:0.7rem;color:#aaa;">' + pl.tracks + ' songs</div>';
            card.addEventListener('click', function() { loadSongs(pl.id); });
            container.appendChild(card);
        });
    } catch(e) {
        container.innerHTML = '<div style="color:#aaa;font-size:0.85rem;">Could not load playlists.</div>';
    }
}

async function loadSongs(playlistId) {
    var container = document.getElementById('suggested-songs');
    if (!container) return;
    container.innerHTML = '<div class="loader">Loading tracks...</div>';
    try {
        var res    = await fetch('/api/playlist/' + playlistId);
        var tracks = await res.json();
        if (!Array.isArray(tracks) || !tracks.length) {
            container.innerHTML = '<div style="color:#aaa;padding:20px;">No tracks found.</div>';
            return;
        }
        window._queue = tracks;
        window._queueIndex = 0;
        renderSongList(tracks, container);
    } catch(e) {
        container.innerHTML = '<div style="color:#aaa;">Could not load tracks.</div>';
    }
}

async function loadRecentlyPlayed() {
    var container = document.getElementById('suggested-songs');
    if (!container) return;
    try {
        var res  = await fetch('/api/recently-played');
        var data = await res.json();
        if (!Array.isArray(data) || !data.length) return;
        window._queue = data;
        window._queueIndex = 0;
        renderSongList(data, container);
    } catch(e) {}
}

function renderSongList(tracks, container) {
    container.innerHTML = '';
    tracks.forEach(function(track, i) {
        var div = document.createElement('div');
        div.className = 'song-row';
        var imgHtml = track.image
            ? '<img src="' + track.image + '" style="width:100%;height:100%;object-fit:cover;">'
            : '<i class="fas fa-music" style="color:#555;font-size:0.85rem;"></i>';
        div.innerHTML =
            '<div class="s-info" style="display:flex;align-items:center;gap:12px;flex:1;overflow:hidden;">' +
                '<div style="width:44px;height:44px;border-radius:10px;background:#333;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;">' + imgHtml + '</div>' +
                '<div style="overflow:hidden;">' +
                    '<div style="font-weight:600;font-size:0.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:280px;">' + track.title + '</div>' +
                    '<div style="font-size:0.75rem;color:#aaa;">' + track.artist + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="play-mini"><i class="fas fa-play" style="font-size:0.75rem;"></i></div>';
        div.addEventListener('click', function() {
            window._queue = tracks;
            window._queueIndex = i;
            window.playSong(track);
        });
        container.appendChild(div);
    });
}

// ── PROFILE HELPERS ───────────────────────────────────────

function editProfile() {
    var el = document.getElementById('userName');
    var newName = prompt('New profile name:', el ? el.innerText : '');
    if (newName && newName.trim() && el) el.innerText = newName;
    var fi = document.getElementById('fileInput');
    if (fi) fi.click();
}

function loadProfileImage(event) {
    var img  = document.getElementById('profilePic');
    var file = event.target.files[0];
    if (!file || !img) return;
    var reader = new FileReader();
    reader.onload = function(e) {
        img.style.backgroundImage = 'url(' + e.target.result + ')';
        img.innerHTML = '';
    };
    reader.readAsDataURL(file);
}