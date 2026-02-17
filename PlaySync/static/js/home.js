// --- DOM ELEMENTS ---
const body = document.body;
const userId = document.getElementById("user-id")?.value;
const sidebar = document.getElementById('sidebar');
const themeIcon = document.getElementById('theme-icon');

// --- TOGGLES ---
function toggleSidebar() { 
    sidebar.classList.toggle('active'); 
}

const likeBtn = document.getElementById("like-btn");

if (likeBtn) {
    likeBtn.addEventListener("click", async () => {
        const player = document.getElementById("player");
        const songId = player?.dataset.songId;

        if (!songId) return alert("No song selected");

        likeBtn.classList.toggle("fas");
        likeBtn.classList.toggle("far");

        // backend call (later real)
        // await apiPost("/songs/like", { song_id: songId });
    });
}


function toggleTheme() {
    body.classList.toggle('light-mode');
    if (themeIcon) {
        if (body.classList.contains('light-mode')) {
            themeIcon.classList.remove('fa-moon'); themeIcon.classList.add('fa-sun');
        } else {
            themeIcon.classList.remove('fa-sun'); themeIcon.classList.add('fa-moon');
        }
    }
}

// --- PLAYER LOGIC (Only runs if player bar exists) ---

const audio = document.getElementById('audio');
if (audio) {
    const playIcon = document.getElementById('playIcon');
    const pTitle = document.getElementById('p-title');
    const pArtist = document.getElementById('p-artist');
    const pImg = document.getElementById('p-img');
    const trackFill = document.getElementById('track-fill');
    const currentTimeEl = document.getElementById('current-time');
    const totalTimeEl = document.getElementById('total-time');
    
    let isPlaying = false;

    window.togglePlay = function() {
        if (isPlaying) {
            audio.pause();
            if(playIcon) { playIcon.classList.remove('fa-pause'); playIcon.classList.add('fa-play'); }
        } else {
            audio.play().catch(e => console.log('Simulated Play'));
            if(playIcon) { playIcon.classList.remove('fa-play'); playIcon.classList.add('fa-pause'); }
        }
        isPlaying = !isPlaying;
    }

    window.playSong = function(song) {
    if(pTitle) pTitle.innerText = song.title;
    if(pArtist) pArtist.innerText = song.artist;

    // store song id for backend actions
    const player = document.getElementById("player");
    if (player) player.dataset.songId = song.song_id;

    // audio source from backend / Spotify
    if (song.preview_url) {
        audio.src = song.preview_url;
    }

    if(!isPlaying) togglePlay();
}

    // Progress Bar
    audio.ontimeupdate = function() {
        if (audio.duration && trackFill) {
            const percent = (audio.currentTime / audio.duration) * 100;
            trackFill.style.width = percent + "%";
            if(currentTimeEl) currentTimeEl.innerText = formatTime(audio.currentTime);
        }
    };

    // Fake progress for UI demo
    setInterval(() => {
        if(isPlaying && !audio.duration && trackFill) {
            let w = parseFloat(trackFill.style.width) || 0;
            if(w >= 100) w = 0;
            trackFill.style.width = (w + 0.5) + "%";
        }
    }, 100);

    window.seek = function(e) {
        if(!trackFill) return;
        const bar = e.currentTarget;
        const percent = e.offsetX / bar.offsetWidth;
        trackFill.style.width = (percent * 100) + "%";
        if(audio.duration) audio.currentTime = percent * audio.duration;
    }

    // Set Total Time
    audio.onloadedmetadata = function() {
        if(totalTimeEl) totalTimeEl.innerText = formatTime(audio.duration);
    }
}

function formatTime(s) {
    const min = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

// --- PROFILE EDIT LOGIC (Only runs on profile page) ---
function editProfile() {
    const currentName = document.getElementById('userName').innerText;
    const newName = prompt("Enter your new profile name:", currentName);
    
    if (newName && newName.trim() !== "") {
        document.getElementById('userName').innerText = newName;
        // Update playlists if they have IDs
        const ids = ['p-desc-1', 'p-desc-2', 'p-desc-3', 'p-desc-4'];
        ids.forEach(id => {
            const el = document.getElementById(id);
            if(el) el.innerText = newName;
        });
    }

    // Trigger Image Upload
    alert("Choose a new profile picture.");
    const fileInput = document.getElementById('fileInput');
    if(fileInput) fileInput.click();
}

function loadProfileImage(event) {
    const image = document.getElementById('profilePic');
    const file = event.target.files[0];
    
    if (file && image) {
        const reader = new FileReader();
        reader.onload = function(e) {
            image.style.backgroundImage = `url('${e.target.result}')`;
            image.innerHTML = ''; 
        }
        reader.readAsDataURL(file);
    }
}