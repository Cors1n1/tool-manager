const API_URL = 'http://127.0.0.1:5555';

// Internal player device_id (received from main process via IPC when SDK is ready)
let internalDeviceId = null;

document.addEventListener('DOMContentLoaded', () => {
    switchTab('hub');

    function checkHeadlessDevice() {
        fetch(`${API_URL}/spotify/headless_device`)
            .then(res => res.json())
            .then(data => {
                if (data.device_id) {
                    if (internalDeviceId !== data.device_id) {
                        internalDeviceId = data.device_id;
                        console.log('[Browser] Received headless player device_id:', data.device_id);
                        updateDeviceIndicator(true);
                    }
                } else {
                    updateDeviceIndicator(false);
                }
            })
            .catch(() => updateDeviceIndicator(false));
    }
    
    setInterval(checkHeadlessDevice, 3000);
    checkHeadlessDevice();
});

function updateDeviceIndicator(connected) {
    const indicator = document.getElementById('deviceIndicator');
    if (!indicator) return;
    if (connected && internalDeviceId) {
        indicator.innerHTML = '<i class="fa-solid fa-headphones"></i> Tocando no Tool Manager';
        indicator.style.color = '#1db954';
    } else {
        indicator.innerHTML = '<i class="fa-solid fa-wifi" style="opacity:0.5"></i> Player interno offline';
        indicator.style.color = '#888';
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById(`tab-${tabId}`).classList.add('active');

    if (tabId === 'hub') {
        loadHub();
    } else if (tabId === 'liked') {
        loadLikedSongs();
    } else if (tabId === 'playlists') {
        loadPlaylists();
    } else if (tabId === 'search') {
        // If they click the search tab, just show the prompt if it's empty, or keep the current results
        const list = document.getElementById('searchList');
        if (!list) {
            document.getElementById('contentArea').innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; margin-top: 40px;">Use a barra de busca acima para encontrar músicas.</div>';
        }
    }
}

async function loadHub() {
    const container = document.getElementById('contentArea');
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; margin-top: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
    
    try {
        const res = await fetch(`${API_URL}/spotify/me/top/tracks?limit=30&time_range=short_term`);
        if (!res.ok) throw new Error("Not logged in");
        const data = await res.json();
        
        container.innerHTML = `
            <div style="grid-column: 1/-1; margin-bottom: 15px; display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                <h2 style="margin: 0; flex: 1;"><i class="fa-solid fa-fire" style="color: #ff4a4a; margin-right: 8px;"></i>Suas Mais Ouvidas Recentemente</h2>
            </div>
            <div class="tracks-list" id="hubList"></div>
        `;
        const list = document.getElementById('hubList');
        const allUris = data.items.filter(t => t).map(t => t.uri);
        
        if (data.items && data.items.length > 0) {
            data.items.forEach((t, index) => {
                if(!t) return;
                const img = t.album && t.album.images && t.album.images.length > 0 ? t.album.images[0].url : '';
                
                const trEl = document.createElement('div');
                trEl.className = 'track-item';
                trEl.onclick = () => playUrisList(allUris, index);
                
                let mins = Math.floor(t.duration_ms / 60000);
                let secs = ((t.duration_ms % 60000) / 1000).toFixed(0);
                let duration = mins + ":" + (secs < 10 ? '0' : '') + secs;

                trEl.innerHTML = `
                    <div class="track-number">${index + 1}</div>
                    <img src="${img}" alt="">
                    <div class="track-info">
                        <div class="track-title">${t.name}</div>
                        <div class="track-artist">${t.artists.map(a=>a.name).join(', ')}</div>
                    </div>
                    <div class="track-duration">${duration}</div>
                    <div class="track-play-icon"><i class="fa-solid fa-play"></i></div>
                `;
                list.appendChild(trEl);
            });
        } else {
            list.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Ouça mais músicas no Spotify para ver suas recomendações!</div>';
        }
    } catch(e) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #f44; margin-top: 40px;">Erro ao carregar o Hub. Verifique o login.</div>`;
    }
}

async function loadLikedSongs() {
    const container = document.getElementById('contentArea');
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; margin-top: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
    
    try {
        const res = await fetch(`${API_URL}/spotify/me/tracks?limit=50`);
        if (!res.ok) throw new Error("Not logged in");
        const data = await res.json();
        
        container.innerHTML = `
            <div style="grid-column: 1/-1; margin-bottom: 15px; display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                <h2 style="margin: 0; flex: 1;"><i class="fa-solid fa-heart" style="color: var(--primary); margin-right: 8px;"></i>Músicas Curtidas</h2>
            </div>
            <div class="tracks-list" id="likedList"></div>
        `;
        const list = document.getElementById('likedList');
        const allUris = data.items.filter(item => item && item.track).map(item => item.track.uri);
        
        if (data.items && data.items.length > 0) {
            data.items.forEach((item, index) => {
                const t = item.track;
                if(!t) return;
                const img = t.album && t.album.images && t.album.images.length > 0 ? t.album.images[0].url : '';
                
                const trEl = document.createElement('div');
                trEl.className = 'track-item';
                trEl.onclick = () => playUrisList(allUris, index);
                
                let mins = Math.floor(t.duration_ms / 60000);
                let secs = ((t.duration_ms % 60000) / 1000).toFixed(0);
                let duration = mins + ":" + (secs < 10 ? '0' : '') + secs;

                trEl.innerHTML = `
                    <div class="track-number">${index + 1}</div>
                    <img src="${img}" alt="">
                    <div class="track-info">
                        <div class="track-title">${t.name}</div>
                        <div class="track-artist">${t.artists.map(a=>a.name).join(', ')}</div>
                    </div>
                    <div class="track-duration">${duration}</div>
                    <div class="track-play-icon"><i class="fa-solid fa-play"></i></div>
                `;
                list.appendChild(trEl);
            });
        } else {
            list.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">Nenhuma música curtida encontrada.</div>';
        }
    } catch(e) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #f44; margin-top: 40px;">Erro ao carregar Músicas Curtidas. Verifique o login.</div>`;
    }
}

async function loadPlaylists() {
    const container = document.getElementById('contentArea');
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; margin-top: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
    
    try {
        const res = await fetch(`${API_URL}/spotify/me/playlists?limit=50`);
        if (!res.ok) throw new Error("Not logged in");
        const data = await res.json();
        
        container.innerHTML = '';
        if (data.items && data.items.length > 0) {
            data.items.forEach(pl => {
                if(!pl) return;
                const img = pl.images && pl.images.length > 0 ? pl.images[0].url : 'https://community.spotify.com/t5/image/serverpage/image-id/25294i2836BD1C1A31BDF2?v=v2';
                
                const card = document.createElement('div');
                card.className = 'card';
                card.onclick = () => loadPlaylistTracks(pl.id, pl.name, pl.uri);
                
                card.innerHTML = `
                    <img src="${img}" alt="${pl.name}">
                    <div class="title" title="${pl.name}">${pl.name}</div>
                    <div class="subtitle">${pl.owner.display_name}</div>
                    <div class="play-btn" onclick="playUri('${pl.uri}', event)" title="Tocar Playlist aqui">
                        <i class="fa-solid fa-play"></i>
                    </div>
                `;
                container.appendChild(card);
            });
        } else {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; margin-top: 40px;">Nenhuma playlist encontrada.</div>';
        }
    } catch (e) {
        container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: #f44; margin-top: 40px;">Erro ao carregar playlists. Verifique se o Spotify está conectado no Tool Manager principal.</div>`;
    }
}

async function loadPlaylistTracks(playlistId, playlistName, playlistUri) {
    const container = document.getElementById('contentArea');
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; margin-top: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
    
    try {
        const res = await fetch(`${API_URL}/spotify/playlists/${playlistId}/tracks?limit=100`);
        const data = await res.json();
        
        const playAllBtn = playlistUri 
            ? `<button onclick="playUri('${playlistUri}', event)" style="background: #1db954; border: none; color: black; padding: 8px 20px; border-radius: 20px; cursor: pointer; font-weight: bold; display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-play"></i> Tocar Tudo</button>`
            : '';

        container.innerHTML = `
            <div style="grid-column: 1/-1; margin-bottom: 15px; display: flex; align-items: center; gap: 15px; flex-wrap: wrap;">
                <button onclick="loadPlaylists()" style="background: #282828; border: none; color: white; padding: 8px 15px; border-radius: 20px; cursor: pointer;"><i class="fa-solid fa-arrow-left"></i> Voltar</button>
                <h2 style="margin: 0; flex: 1;">${playlistName}</h2>
                ${playAllBtn}
            </div>
            <div class="tracks-list" id="tracksList"></div>
        `;
        
        const list = document.getElementById('tracksList');
        if (data.items && data.items.length > 0) {
            data.items.forEach((item, index) => {
                const t = item.track;
                if(!t) return;
                const img = t.album && t.album.images && t.album.images.length > 0 ? t.album.images[0].url : '';
                
                const trEl = document.createElement('div');
                trEl.className = 'track-item';
                trEl.onclick = () => playTrackInContext(t.uri, playlistUri, index);
                
                let mins = Math.floor(t.duration_ms / 60000);
                let secs = ((t.duration_ms % 60000) / 1000).toFixed(0);
                let duration = mins + ":" + (secs < 10 ? '0' : '') + secs;

                trEl.innerHTML = `
                    <div class="track-number">${index + 1}</div>
                    <img src="${img}" alt="">
                    <div class="track-info">
                        <div class="track-title">${t.name}</div>
                        <div class="track-artist">${t.artists.map(a=>a.name).join(', ')}</div>
                    </div>
                    <div class="track-duration">${duration}</div>
                    <div class="track-play-icon"><i class="fa-solid fa-play"></i></div>
                `;
                list.appendChild(trEl);
            });
        }
    } catch(e) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #f44; margin-top: 40px;">Erro ao carregar músicas.</div>';
    }
}

async function doSearch() {
    const q = document.getElementById('searchInput').value.trim();
    if (!q) return;
    
    // Manually activate search tab without triggering the load logic
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-search').classList.add('active');

    const container = document.getElementById('contentArea');
    container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; margin-top: 40px;"><i class="fa-solid fa-spinner fa-spin fa-2x"></i></div>';
    
    try {
        const res = await fetch(`${API_URL}/spotify/search?q=${encodeURIComponent(q)}&type=track`);
        const data = await res.json();
        
        container.innerHTML = '<div class="tracks-list" id="searchList"></div>';
        const list = document.getElementById('searchList');
        
        const allUris = data.tracks.items.filter(t => t).map(t => t.uri);
        
        if (data.tracks && data.tracks.items && data.tracks.items.length > 0) {
            data.tracks.items.forEach((t, index) => {
                const img = t.album && t.album.images && t.album.images.length > 0 ? t.album.images[0].url : '';
                const trEl = document.createElement('div');
                trEl.className = 'track-item';
                trEl.onclick = () => playUrisList(allUris, index);
                
                let mins = Math.floor(t.duration_ms / 60000);
                let secs = ((t.duration_ms % 60000) / 1000).toFixed(0);
                let duration = mins + ":" + (secs < 10 ? '0' : '') + secs;

                trEl.innerHTML = `
                    <div class="track-number">${index + 1}</div>
                    <img src="${img}" alt="">
                    <div class="track-info">
                        <div class="track-title">${t.name}</div>
                        <div class="track-artist">${t.artists.map(a=>a.name).join(', ')}</div>
                    </div>
                    <div class="track-duration">${duration}</div>
                    <div class="track-play-icon"><i class="fa-solid fa-play"></i></div>
                `;
                list.appendChild(trEl);
            });
        } else {
            container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #888; margin-top: 40px;">Nenhum resultado encontrado.</div>';
        }
    } catch(e) {
        container.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: #f44; margin-top: 40px;">Erro na busca.</div>';
    }
}

/**
 * Play a specific track within a context (playlist/album).
 * Routes playback to the internal Tool Manager Player if available.
 */
async function playTrackInContext(trackUri, contextUri, offsetIndex) {
    let body = {
        context_uri: contextUri,
        offset: { position: offsetIndex }
    };

    if (internalDeviceId) {
        await playOnDevice(body, internalDeviceId);
    } else {
        await playOnDevice(body, null);
    }
}

/**
 * Plays a list of track URIs starting from a specific index
 */
async function playUrisList(urisArray, offsetIndex = 0) {
    let body = {
        uris: urisArray,
        offset: { position: offsetIndex }
    };

    if (internalDeviceId) {
        await playOnDevice(body, internalDeviceId);
    } else {
        await playOnDevice(body, null);
    }
}

/**
 * Play a URI (track or context) on the specified device.
 * If no deviceId, plays on currently active device.
 */
async function playUri(uri, event) {
    if (event) {
        event.stopPropagation();
    }
    
    let body = {};
    if (uri.includes('spotify:track:')) {
        body = { uris: [uri] };
    } else {
        body = { context_uri: uri };
    }

    if (internalDeviceId) {
        await playOnDevice(body, internalDeviceId);
    } else {
        await playOnDevice(body, null);
    }
}

async function playOnDevice(body, deviceId) {
    try {
        const url = deviceId
            ? `${API_URL}/spotify/me/player/play?device_id=${deviceId}`
            : `${API_URL}/spotify/me/player/play`;
        
        await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
    } catch(e) {
        console.error("Play error:", e);
    }
}
