// PlaySync home.js

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

// ── PERSISTENT PLAYER STATE ────────────────────────────────

function savePlayerState() {
    if (!currentSong) return;
    try {
        sessionStorage.setItem('playerState', JSON.stringify({
            song: currentSong,
            src: audio.src,
            currentTime: audio.currentTime,
            isPlaying: isPlaying,
            queue: window._queue || [],
            queueIndex: window._queueIndex || 0
        }));
    } catch(e) {}
}

function restorePlayerState() {
    try {
        var raw = sessionStorage.getItem('playerState');
        if (!raw) return;
        var state = JSON.parse(raw);
        if (!state || !state.song || !state.src) return;

        currentSong = state.song;
        window._queue = state.queue || [];
        window._queueIndex = state.queueIndex || 0;

        if (pTitle)  pTitle.innerText  = state.song.title  || '';
        if (pArtist) pArtist.innerText = state.song.artist || '';
        if (pImg) {
            if (state.song.image) {
                pImg.style.backgroundImage = 'url(' + state.song.image + ')';
                pImg.innerHTML = '';
            } else {
                pImg.style.backgroundImage = '';
                pImg.innerHTML = '<i class="fas fa-music" style="color:#555;font-size:1.3rem;"></i>';
            }
        }
        var playerEl = document.getElementById('player');
        if (playerEl) playerEl.dataset.songId = state.song.song_id || '';

        audio.src = state.src;
        audio.load();
        audio.currentTime = state.currentTime || 0;

        if (state.isPlaying) {
            audio.play().then(function() {
                isPlaying = true;
                if (playIcon) { playIcon.classList.remove('fa-play'); playIcon.classList.add('fa-pause'); }
            }).catch(function() {
                isPlaying = false;
                if (playIcon) { playIcon.classList.remove('fa-pause'); playIcon.classList.add('fa-play'); }
            });
        }
    } catch(e) {}
}

function setupNavPersistence() {
    document.querySelectorAll('.menu-item, a[href]').forEach(function(el) {
        el.addEventListener('click', function() { savePlayerState(); });
    });
    window.addEventListener('beforeunload', savePlayerState);
}

// ── PLAY A SONG ────────────────────────────────────────────

window.playSong = async function(song) {
    currentSong = song;

    if (pTitle)  pTitle.innerText  = song.title  || 'Loading...';
    if (pArtist) pArtist.innerText = song.artist || '';
    if (pImg) {
        if (song.image) {
            pImg.style.backgroundImage = 'url(' + song.image + ')';
            pImg.innerHTML = '';
        } else {
            pImg.style.backgroundImage = '';
            pImg.innerHTML = '<i class="fas fa-music" style="color:#555;font-size:1.3rem;"></i>';
        }
    }
    var playerEl = document.getElementById('player');
    if (playerEl) playerEl.dataset.songId = song.song_id || '';

    audio.pause();
    audio.src = '';
    isPlaying = false;
    if (playIcon) { playIcon.classList.remove('fa-pause'); playIcon.classList.add('fa-play'); }

    try {
        var res  = await fetch('/api/stream?q=' + encodeURIComponent((song.title || '') + ' ' + (song.artist || '')));
        var data = await res.json();

        if (data.error || !data.url) {
            if (pTitle)  pTitle.innerText  = song.title || '';
            if (pArtist) pArtist.innerText = (song.artist || '') + ' — not found';
            return;
        }

        if (pTitle)  pTitle.innerText  = song.title  || data.title || '';
        if (pArtist) pArtist.innerText = song.artist || '';

        audio.src = data.url;
        audio.load();
        audio.play().then(function() {
            isPlaying = true;
            if (playIcon) { playIcon.classList.remove('fa-play'); playIcon.classList.add('fa-pause'); }
            savePlayerState();
        }).catch(function(err) { console.error('play() error:', err); });

    } catch(err) {
        console.error('Fetch /api/stream failed:', err);
        if (pArtist) pArtist.innerText = (song.artist || '') + ' — connection error';
    }
};

// ── CONTROLS ──────────────────────────────────────────────

window.togglePlay = function() {
    if (!audio.src) return;
    if (isPlaying) {
        audio.pause(); isPlaying = false;
        if (playIcon) { playIcon.classList.remove('fa-pause'); playIcon.classList.add('fa-play'); }
    } else {
        audio.play(); isPlaying = true;
        if (playIcon) { playIcon.classList.remove('fa-play'); playIcon.classList.add('fa-pause'); }
    }
    savePlayerState();
};

window.playNext = function() {
    if (window._queue && window._queueIndex < window._queue.length - 1) {
        window._queueIndex++;
        window.playSong(window._queue[window._queueIndex]);
    }
};

window.playPrev = function() {
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
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

window.setVolume = function(v) { audio.volume = parseInt(v) / 100; };

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
    if (window._queue && window._queueIndex < window._queue.length - 1) {
        window._queueIndex++;
        window.playSong(window._queue[window._queueIndex]);
    }
};
audio.onerror = function() {
    isPlaying = false;
    if (playIcon) { playIcon.classList.remove('fa-pause'); playIcon.classList.add('fa-play'); }
};

function fmt(s) {
    if (!s || isNaN(s)) return '0:00';
    var m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return m + ':' + (sec < 10 ? '0' : '') + sec;
}

// ── SEARCH DROPDOWN ───────────────────────────────────────

window.handleSearch = function() {
    var q = document.getElementById('global-search').value.trim();
    clearTimeout(searchTimer);
    closeDropdown();
    if (!q) return;
    searchTimer = setTimeout(function() { doSearch(q); }, 400);
};

async function doSearch(query) {
    showDropdownLoading();
    try {
        var res = await fetch('/api/search-tracks?q=' + encodeURIComponent(query));
        if (!res.ok) { showDropdownError('Search unavailable. Please connect Spotify.'); return; }
        var tracks = await res.json();
        if (tracks && tracks.error) { showDropdownError(tracks.error); return; }
        if (!Array.isArray(tracks) || !tracks.length) { showDropdownEmpty(); return; }
        renderDropdown(tracks);
    } catch(e) {
        showDropdownError('Search failed. Check your connection.');
    }
}

function showDropdownLoading() {
    closeDropdown();
    var box = makeBox();
    var row = document.createElement('div');
    row.style.padding = '14px 16px';
    row.innerHTML = '<span style="color:#aaa;font-size:0.85rem;">Searching...</span>';
    box.appendChild(row); attachBox(box);
}
function showDropdownEmpty() {
    closeDropdown();
    var box = makeBox();
    var row = document.createElement('div');
    row.style.padding = '14px 16px';
    row.innerHTML = '<span style="color:#aaa;font-size:0.85rem;">No results found</span>';
    box.appendChild(row); attachBox(box);
}
function showDropdownError(msg) {
    closeDropdown();
    var box = makeBox();
    var row = document.createElement('div');
    row.style.padding = '14px 16px';
    row.innerHTML = '<span style="color:#f87171;font-size:0.85rem;"><i class="fas fa-exclamation-circle" style="margin-right:6px;"></i>' + msg + '</span>';
    box.appendChild(row); attachBox(box);
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
    restorePlayerState();
    setupNavPersistence();
    loadTopArtists();
    loadPlaylists();
    loadRecentlyPlayed();
    setupVibeCards();
    setupProfileCards();
});

// Close modal with Escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeAnyModal();
});

function closeAnyModal() {
    var o = document.getElementById('playlist-modal-overlay');
    if (o) o.remove();
}

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
                : '<div style="width:100%;aspect-ratio:1;border-radius:8px;background:#333;margin-bottom:6px;display:flex;align-items:center;justify-content:center;"><i class="fas fa-music" style="color:#555;font-size:1.5rem;"></i></div>';
            card.innerHTML = imgHtml +
                '<div style="font-size:0.8rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + pl.name + '</div>' +
                '<div style="font-size:0.7rem;color:#aaa;">' + pl.tracks + ' songs</div>';
            card.addEventListener('click', function() { openPlaylistModal(pl); });
            container.appendChild(card);
        });
    } catch(e) {
        container.innerHTML = '<div style="color:#aaa;font-size:0.85rem;">Could not load playlists.</div>';
    }
}

async function loadRecentlyPlayed() {
    var container = document.getElementById('suggested-songs');
    if (!container) return;
    try {
        var res  = await fetch('/api/recently-played');
        var data = await res.json();
        if (!Array.isArray(data) || !data.length) return;
        if (!window._queue || !window._queue.length) {
            window._queue = data;
            window._queueIndex = 0;
        }
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

// ── PLAYLIST MODAL (Spotify playlists) ────────────────────

async function openPlaylistModal(pl) {
    closeAnyModal();

    var overlay = buildModalOverlay();
    var modal   = buildModalBox();

    var mHeader = buildModalHeader(
        pl.image
            ? '<img src="' + pl.image + '" style="width:56px;height:56px;border-radius:10px;object-fit:cover;flex-shrink:0;">'
            : '<div style="width:56px;height:56px;border-radius:10px;background:#333;flex-shrink:0;display:flex;align-items:center;justify-content:center;"><i class="fas fa-music" style="color:#555;"></i></div>',
        pl.name,
        pl.tracks + ' songs'
    );

    var mBody = buildModalBody('<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Loading tracks...');

    var playAllBtn = mHeader.querySelector('.modal-play-all');
    var closeBtn   = mHeader.querySelector('.modal-close');
    closeBtn.onclick = closeAnyModal;

    modal.appendChild(mHeader);
    modal.appendChild(mBody);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var tracks = [];
    try {
        var res = await fetch('/api/playlist/' + pl.id);
        tracks = await res.json();
        if (!Array.isArray(tracks) || !tracks.length) {
            mBody.innerHTML = '<div style="padding:30px;text-align:center;color:#aaa;">No tracks found in this playlist.</div>';
            return;
        }
    } catch(e) {
        mBody.innerHTML = '<div style="padding:30px;text-align:center;color:#f87171;">Could not load tracks.</div>';
        return;
    }

    fillModalBody(mBody, tracks, overlay);

    playAllBtn.addEventListener('click', function() {
        if (!tracks.length) return;
        window._queue = tracks; window._queueIndex = 0;
        window.playSong(tracks[0]);
        overlay.remove();
        var c = document.getElementById('suggested-songs');
        if (c) renderSongList(tracks, c);
    });
}

// ── VIBE CARDS & PROFILE CARDS ────────────────────────────

var VIBE_QUERIES = {
    'pop':   'top pop hits 2024',
    'chill': 'chill lofi relax',
    'indie': 'indie alternative',
    'rock':  'rock classics'
};

function setupVibeCards() {
    document.querySelectorAll('.vibe-card[data-vibe]').forEach(function(card) {
        card.addEventListener('click', function() {
            var vibe  = card.getAttribute('data-vibe');
            var label = card.querySelector('.v-card-title') ? card.querySelector('.v-card-title').innerText : vibe;
            openSearchModal(label, VIBE_QUERIES[vibe] || vibe);
        });
    });
}

function setupProfileCards() {
    document.querySelectorAll('.p-card').forEach(function(card) {
        var titleEl = card.querySelector('.p-title');
        var label   = titleEl ? titleEl.innerText.trim() : 'Playlist';
        card.addEventListener('click', function() {
            openSearchModal(label, label + ' music');
        });
    });
}

async function openSearchModal(label, query) {
    closeAnyModal();

    var overlay = buildModalOverlay();
    var modal   = buildModalBox();

    var mHeader = buildModalHeader(
        '<div style="width:56px;height:56px;border-radius:12px;background:var(--accent);display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-music" style="color:#fff;font-size:1.2rem;"></i></div>',
        label,
        'Songs'
    );

    var mBody = buildModalBody('<i class="fas fa-spinner fa-spin" style="margin-right:8px;"></i>Loading songs...');

    var playAllBtn = mHeader.querySelector('.modal-play-all');
    var closeBtn   = mHeader.querySelector('.modal-close');
    closeBtn.onclick = closeAnyModal;

    modal.appendChild(mHeader);
    modal.appendChild(mBody);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    var tracks = [];
    try {
        var res = await fetch('/api/search-tracks?q=' + encodeURIComponent(query));
        if (!res.ok) throw new Error('not ok');
        tracks = await res.json();
        if (tracks && tracks.error) throw new Error(tracks.error);
        if (!Array.isArray(tracks) || !tracks.length) {
            mBody.innerHTML = '<div style="padding:30px;text-align:center;color:#aaa;">No songs found.</div>';
            return;
        }
    } catch(e) {
        mBody.innerHTML = '<div style="padding:30px;text-align:center;color:#f87171;"><i class="fas fa-exclamation-circle" style="margin-right:8px;"></i>Could not load songs. Make sure Spotify is connected.</div>';
        return;
    }

    fillModalBody(mBody, tracks, overlay);

    playAllBtn.addEventListener('click', function() {
        if (!tracks.length) return;
        window._queue = tracks; window._queueIndex = 0;
        window.playSong(tracks[0]);
        overlay.remove();
        var c = document.getElementById('suggested-songs');
        if (c) renderSongList(tracks, c);
    });
}

// ── MODAL HELPERS ─────────────────────────────────────────

function buildModalOverlay() {
    var overlay = document.createElement('div');
    overlay.id = 'playlist-modal-overlay';
    overlay.style.cssText = [
        'position:fixed','top:0','left:0','width:100vw','height:100vh',
        'background:rgba(0,0,0,0.7)','backdrop-filter:blur(6px)',
        'z-index:1000','display:flex','align-items:center','justify-content:center'
    ].join(';');
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.remove();
    });
    return overlay;
}

function buildModalBox() {
    var modal = document.createElement('div');
    modal.style.cssText = [
        'background:var(--card-bg)','border:1px solid var(--glass-border)',
        'border-radius:24px','width:90%','max-width:520px',
        'max-height:80vh','display:flex','flex-direction:column',
        'overflow:hidden','box-shadow:0 30px 60px rgba(0,0,0,0.5)'
    ].join(';');
    return modal;
}

function buildModalHeader(iconHtml, title, subtitle) {
    var h = document.createElement('div');
    h.style.cssText = 'display:flex;align-items:center;gap:16px;padding:20px 24px;border-bottom:1px solid var(--glass-border);flex-shrink:0;';

    var info = document.createElement('div');
    info.style.cssText = 'flex:1;overflow:hidden;';
    info.innerHTML =
        '<div style="font-weight:700;font-size:1.1rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + title + '</div>' +
        '<div style="font-size:0.75rem;color:#aaa;">' + subtitle + '</div>';

    var playAllBtn = document.createElement('button');
    playAllBtn.className = 'modal-play-all';
    playAllBtn.style.cssText = 'display:flex;align-items:center;gap:8px;background:var(--accent);color:#fff;border:none;border-radius:20px;padding:10px 20px;font-weight:700;font-size:0.85rem;cursor:pointer;transition:opacity 0.2s;flex-shrink:0;';
    playAllBtn.innerHTML = '<i class="fas fa-play"></i> Play All';
    playAllBtn.onmouseover = function() { playAllBtn.style.opacity = '0.82'; };
    playAllBtn.onmouseout  = function() { playAllBtn.style.opacity = '1'; };

    var closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.style.cssText = 'background:transparent;border:none;color:var(--text-color);font-size:1.2rem;cursor:pointer;padding:4px 8px;margin-left:4px;flex-shrink:0;';
    closeBtn.innerHTML = '<i class="fas fa-times"></i>';

    h.insertAdjacentHTML('afterbegin', iconHtml);
    h.appendChild(info);
    h.appendChild(playAllBtn);
    h.appendChild(closeBtn);
    return h;
}

function buildModalBody(loadingMsg) {
    var b = document.createElement('div');
    b.style.cssText = 'overflow-y:auto;flex:1;padding:8px 0;';
    b.innerHTML = '<div style="padding:30px;text-align:center;color:#aaa;font-size:0.9rem;">' + loadingMsg + '</div>';
    return b;
}

function fillModalBody(mBody, tracks, overlay) {
    mBody.innerHTML = '';
    tracks.forEach(function(track, i) {
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 24px;cursor:pointer;transition:background 0.15s;';
        row.onmouseover = function() { row.style.background = 'var(--card-hover)'; };
        row.onmouseout  = function() { row.style.background = 'transparent'; };

        var imgHtml = track.image
            ? '<img src="' + track.image + '" style="width:44px;height:44px;border-radius:8px;object-fit:cover;flex-shrink:0;">'
            : '<div style="width:44px;height:44px;border-radius:8px;background:#333;flex-shrink:0;display:flex;align-items:center;justify-content:center;"><i class="fas fa-music" style="color:#555;font-size:0.8rem;"></i></div>';

        row.innerHTML = imgHtml +
            '<div style="flex:1;overflow:hidden;">' +
                '<div style="font-weight:600;font-size:0.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + track.title + '</div>' +
                '<div style="font-size:0.75rem;color:#aaa;">' + track.artist + '</div>' +
            '</div>' +
            '<div class="mini-play-btn" style="width:34px;height:34px;border-radius:50%;background:var(--bg-color);display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:0.2s;">' +
                '<i class="fas fa-play" style="font-size:0.7rem;"></i>' +
            '</div>';

        var miniBtn = row.querySelector('.mini-play-btn');
        miniBtn.onmouseover = function() { miniBtn.style.background = 'var(--accent)'; miniBtn.style.color = '#fff'; };
        miniBtn.onmouseout  = function() { miniBtn.style.background = 'var(--bg-color)'; miniBtn.style.color = ''; };

        row.addEventListener('click', function() {
            window._queue = tracks;
            window._queueIndex = i;
            window.playSong(track);
            overlay.remove();
            var c = document.getElementById('suggested-songs');
            if (c) renderSongList(tracks, c);
        });
        mBody.appendChild(row);
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
