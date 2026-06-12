import os
import json
import uuid
import socket
import shlex
import subprocess
import threading
import time
import secrets
import psutil
import requests as http_requests
from collections import deque
from urllib.parse import urlencode
from flask import Flask, request, jsonify, redirect, send_file
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

# Spotify Config
SPOTIFY_CLIENT_ID = os.getenv('SPOTIFY_CLIENT_ID', '')
SPOTIFY_CLIENT_SECRET = os.getenv('SPOTIFY_CLIENT_SECRET', '')
SPOTIFY_REDIRECT_URI = os.getenv('SPOTIFY_REDIRECT_URI', 'http://127.0.0.1:5555/spotify/callback')
SPOTIFY_TOKEN_FILE = 'spotify_token.json'
SPOTIFY_SCOPES = 'streaming user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative user-library-read user-top-read'

HEADLESS_DEVICE_ID = None

def _read_spotify_token():
    if os.path.exists(SPOTIFY_TOKEN_FILE):
        with open(SPOTIFY_TOKEN_FILE, 'r') as f:
            return json.load(f)
    return None

def _save_spotify_token(token_data):
    token_data['saved_at'] = time.time()
    with open(SPOTIFY_TOKEN_FILE, 'w') as f:
        json.dump(token_data, f, indent=2)

def _refresh_spotify_token():
    token_data = _read_spotify_token()
    if not token_data or 'refresh_token' not in token_data:
        return None
    resp = http_requests.post('https://accounts.spotify.com/api/token', data={
        'grant_type': 'refresh_token',
        'refresh_token': token_data['refresh_token'],
        'client_id': SPOTIFY_CLIENT_ID,
        'client_secret': SPOTIFY_CLIENT_SECRET,
    })
    if resp.status_code == 200:
        new_data = resp.json()
        new_data['refresh_token'] = token_data.get('refresh_token')
        if 'refresh_token' in resp.json():
            new_data['refresh_token'] = resp.json()['refresh_token']
        _save_spotify_token(new_data)
        return new_data
    return None

def _get_spotify_access_token():
    token_data = _read_spotify_token()
    if not token_data:
        return None
    elapsed = time.time() - token_data.get('saved_at', 0)
    if elapsed >= token_data.get('expires_in', 3600) - 120:
        token_data = _refresh_spotify_token()
    if token_data:
        return token_data.get('access_token')
    return None

def _spotify_headers():
    token = _get_spotify_access_token()
    if not token:
        return None
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}

# Spotify OAuth Endpoints
@app.route('/spotify/login')
def spotify_login():
    state = secrets.token_urlsafe(16)
    params = urlencode({
        'client_id': SPOTIFY_CLIENT_ID,
        'response_type': 'code',
        'redirect_uri': SPOTIFY_REDIRECT_URI,
        'scope': SPOTIFY_SCOPES,
        'state': state,
        'show_dialog': 'true'
    })
    return redirect(f'https://accounts.spotify.com/authorize?{params}')

@app.route('/spotify/callback')
def spotify_callback():
    code = request.args.get('code')
    error = request.args.get('error')
    if error:
        return f'<html><body style="background:#111;color:#fff;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><h2>Erro: {error}</h2></body></html>'
    resp = http_requests.post('https://accounts.spotify.com/api/token', data={
        'grant_type': 'authorization_code',
        'code': code,
        'redirect_uri': SPOTIFY_REDIRECT_URI,
        'client_id': SPOTIFY_CLIENT_ID,
        'client_secret': SPOTIFY_CLIENT_SECRET,
    })
    if resp.status_code == 200:
        _save_spotify_token(resp.json())
        return '<html><body style="background:#111;color:#0f0;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;flex-direction:column"><h2>✅ Spotify Conectado!</h2><p style="color:#888">Pode fechar esta janela.</p><script>setTimeout(()=>window.close(),1500)</script></body></html>'
    return f'<html><body style="background:#111;color:#f00;font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh"><h2>Erro ao autenticar: {resp.text}</h2></body></html>'

@app.route('/spotify/status')
def spotify_status():
    token = _get_spotify_access_token()
    return jsonify({'authenticated': token is not None})

@app.route('/spotify/token')
def spotify_token():
    """Delivers the access token securely to the Web Playback SDK running in the renderer."""
    token = _get_spotify_access_token()
    if not token:
        return jsonify({'error': 'not_authenticated'}), 401
    return jsonify({'access_token': token})

@app.route('/spotify/logout', methods=['POST'])
def spotify_logout():
    if os.path.exists(SPOTIFY_TOKEN_FILE):
        os.remove(SPOTIFY_TOKEN_FILE)
    return jsonify({'status': 'ok'})

@app.route('/spotify/headless_player')
def spotify_headless_player():
    """Serves the headless player HTML file."""
    return send_file(os.path.join(os.path.dirname(__file__), 'ui', 'spotify-headless.html'))

@app.route('/spotify/headless_device', methods=['POST'])
def spotify_headless_device():
    global HEADLESS_DEVICE_ID
    data = request.json or {}
    device_id = data.get('device_id')
    if device_id:
        HEADLESS_DEVICE_ID = device_id
        return jsonify({'status': 'ok'})
    return jsonify({'error': 'no_device'}), 400

@app.route('/spotify/headless_device', methods=['GET'])
def get_spotify_headless_device():
    return jsonify({'device_id': HEADLESS_DEVICE_ID})

@app.route('/favicon.ico')
def favicon():
    return '', 204

# Spotify Player Proxy Endpoints
@app.route('/spotify/me/player')
def spotify_player_state():
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    resp = http_requests.get('https://api.spotify.com/v1/me/player', headers=headers)
    if resp.status_code == 204 or resp.status_code == 202:
        return jsonify({'is_playing': False, 'item': None})
    if resp.status_code == 200:
        return jsonify(resp.json())
    return jsonify({'error': resp.text}), resp.status_code

@app.route('/spotify/me/player', methods=['PUT'])
def spotify_transfer_device():
    """Transfer playback to a different device (e.g., the internal SDK player)."""
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    body = request.get_json(silent=True) or {}
    resp = http_requests.put('https://api.spotify.com/v1/me/player', headers=headers, json=body)
    return jsonify({'status': 'ok'}), resp.status_code

@app.route('/spotify/me/player/play', methods=['PUT'])
def spotify_play():
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    body = request.get_json(silent=True) or {}
    # device_id can be passed as a query param to target a specific player device
    device_id = request.args.get('device_id', '')
    url = 'https://api.spotify.com/v1/me/player/play'
    if device_id:
        url += f'?device_id={device_id}'
    resp = http_requests.put(url, headers=headers, json=body if body else None)
    return jsonify({'status': 'ok'}), resp.status_code

@app.route('/spotify/me/player/pause', methods=['PUT'])
def spotify_pause():
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    resp = http_requests.put('https://api.spotify.com/v1/me/player/pause', headers=headers)
    return jsonify({'status': 'ok'}), resp.status_code

@app.route('/spotify/me/player/next', methods=['POST'])
def spotify_next():
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    resp = http_requests.post('https://api.spotify.com/v1/me/player/next', headers=headers)
    return jsonify({'status': 'ok'}), resp.status_code

@app.route('/spotify/me/player/previous', methods=['POST'])
def spotify_previous():
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    resp = http_requests.post('https://api.spotify.com/v1/me/player/previous', headers=headers)
    return jsonify({'status': 'ok'}), resp.status_code

@app.route('/spotify/me/player/volume', methods=['PUT'])
def spotify_volume():
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    vol = request.args.get('volume_percent', 50)
    resp = http_requests.put(f'https://api.spotify.com/v1/me/player/volume?volume_percent={vol}', headers=headers)
    return jsonify({'status': 'ok'}), resp.status_code

# Spotify Library Endpoints
@app.route('/spotify/me/playlists')
def spotify_playlists():
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    limit = request.args.get('limit', 50)
    offset = request.args.get('offset', 0)
    resp = http_requests.get(f'https://api.spotify.com/v1/me/playlists?limit={limit}&offset={offset}', headers=headers)
    if resp.status_code == 200:
        return jsonify(resp.json())
    return jsonify({'error': resp.text}), resp.status_code

@app.route('/spotify/playlists/<playlist_id>/tracks')
def spotify_playlist_tracks(playlist_id):
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    limit = request.args.get('limit', 100)
    offset = request.args.get('offset', 0)
    resp = http_requests.get(f'https://api.spotify.com/v1/playlists/{playlist_id}/tracks?limit={limit}&offset={offset}', headers=headers)
    if resp.status_code == 200:
        return jsonify(resp.json())
    return jsonify({'error': resp.text}), resp.status_code

@app.route('/spotify/me/tracks')
def spotify_saved_tracks():
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    limit = request.args.get('limit', 50)
    offset = request.args.get('offset', 0)
    resp = http_requests.get(f'https://api.spotify.com/v1/me/tracks?limit={limit}&offset={offset}', headers=headers)
    if resp.status_code == 200:
        return jsonify(resp.json())
    return jsonify({'error': resp.text}), resp.status_code

@app.route('/spotify/me/top/tracks')
def spotify_top_tracks():
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    limit = request.args.get('limit', 50)
    time_range = request.args.get('time_range', 'short_term')
    resp = http_requests.get(f'https://api.spotify.com/v1/me/top/tracks?limit={limit}&time_range={time_range}', headers=headers)
    if resp.status_code == 200:
        return jsonify(resp.json())
    return jsonify({'error': resp.text}), resp.status_code

@app.route('/spotify/search')
def spotify_search():
    headers = _spotify_headers()
    if not headers:
        return jsonify({'error': 'not_authenticated'}), 401
    q = request.args.get('q', '')
    search_type = request.args.get('type', 'track')
    limit = request.args.get('limit', 20)
    resp = http_requests.get(f'https://api.spotify.com/v1/search?q={q}&type={search_type}&limit={limit}', headers=headers)
    if resp.status_code == 200:
        return jsonify(resp.json())
    return jsonify({'error': resp.text}), resp.status_code

CONFIG_FILE = "config.json"
processes = {}
active_ports = {}  # tool_id -> int
tool_logs = {}  # tool_id -> deque(maxlen=500)

def find_free_port(start_port=8080, max_port=9000):
    for port in range(start_port, max_port):
        # Prevent picking a port we just assigned in the same run
        if port in active_ports.values():
            continue
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(0.05)
            if s.connect_ex(('127.0.0.1', port)) != 0:
                return port
    return None

def stop_tool(tool_id):
    if tool_id in processes:
        proc = processes[tool_id]
        parent = psutil.Process(proc.pid)
        for child in parent.children(recursive=True):
            child.terminate()
        parent.terminate()
        parent.wait(timeout=3)
        del processes[tool_id]
        if tool_id in active_ports:
            del active_ports[tool_id]

def _ensure_config():
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, 'w') as f:
            json.dump({"tools": []}, f)

def _read_config():
    _ensure_config()
    with open(CONFIG_FILE, 'r') as f:
        return json.load(f)

def _write_config(data):
    with open(CONFIG_FILE, 'w') as f:
        json.dump(data, f, indent=4)

@app.route('/tools', methods=['GET'])
def get_tools():
    config = _read_config()
    for tool in config['tools']:
        tool['running'] = tool['id'] in processes and processes[tool['id']].poll() is None
        if tool['running'] and tool['id'] in active_ports:
            tool['active_port'] = active_ports[tool['id']]
    return jsonify(config['tools'])

@app.route('/system-info', methods=['GET'])
def get_system_info():
    # interval=0.1 garante que a leitura da CPU seja precisa, bloqueando por apenas 100ms
    cpu = psutil.cpu_percent(interval=0.1)
    mem = psutil.virtual_memory()
    
    disks = []
    for part in psutil.disk_partitions(all=False):
        if os.name == 'nt':
            if 'cdrom' in part.opts or part.fstype == '':
                continue
        try:
            usage = psutil.disk_usage(part.mountpoint)
            disks.append({
                "device": part.device,
                "mountpoint": part.mountpoint,
                "total": usage.total,
                "used": usage.used,
                "free": usage.free,
                "percent": usage.percent
            })
        except Exception:
            pass
            
    return jsonify({
        "cpu_percent": cpu,
        "memory": {
            "total": mem.total,
            "used": mem.used,
            "percent": mem.percent
        },
        "disks": disks
    })

@app.route('/tools', methods=['POST'])
def add_tool():
    data = request.json
    config = _read_config()
    tool_id = str(uuid.uuid4())
    config['tools'].append({
        "id": tool_id,
        "name": data.get("name"),
        "command": data.get("command"),
        "directory": data.get("directory", ""),
        "auto_start": data.get("auto_start", False),
        "category": data.get("category", "Geral"),
        "env_vars": data.get("env_vars", ""),
        "hotkey": data.get("hotkey", ""),
        "auto_port": data.get("auto_port", False)
    })
    _write_config(config)
    return get_tools()

@app.route('/tools/<tool_id>', methods=['PUT'])
def edit_tool(tool_id):
    data = request.json
    config = _read_config()
    for tool in config['tools']:
        if tool['id'] == tool_id:
            tool['name'] = data.get("name", tool['name'])
            tool['command'] = data.get("command", tool['command'])
            tool['directory'] = data.get("directory", tool['directory'])
            tool['auto_start'] = data.get("auto_start", tool.get("auto_start", False))
            tool['category'] = data.get("category", tool.get("category", "Geral"))
            tool['env_vars'] = data.get("env_vars", tool.get("env_vars", ""))
            tool['hotkey'] = data.get("hotkey", tool.get("hotkey", ""))
            tool['auto_port'] = data.get("auto_port", tool.get("auto_port", False))
            break
    _write_config(config)
    return get_tools()

@app.route('/tools/<tool_id>', methods=['DELETE'])
def delete_tool(tool_id):
    if tool_id in processes:
        stop_tool(tool_id)
    config = _read_config()
    config['tools'] = [t for t in config['tools'] if t['id'] != tool_id]
    _write_config(config)
    return jsonify(config['tools'])

@app.route('/tools/stop-all', methods=['POST'])
def stop_all_tools():
    for tid in list(processes.keys()):
        stop_tool(tid)
    return jsonify({"status": "ok"})

@app.route('/tools/reorder', methods=['POST'])
def reorder_tools():
    data = request.json
    config = _read_config()
    
    new_tools = []
    for tid in data.get('order', []):
        for tool in config['tools']:
            if tool['id'] == tid:
                new_tools.append(tool)
                break
                
    for tool in config['tools']:
        if tool not in new_tools:
            new_tools.append(tool)
            
    config['tools'] = new_tools
    _write_config(config)
    return jsonify(config['tools'])

@app.route('/tools/<tool_id>/logs', methods=['GET'])
def get_logs(tool_id):
    if tool_id in tool_logs:
        return jsonify(list(tool_logs[tool_id]))
    return jsonify([])

@app.route('/tools/<tool_id>/logs', methods=['DELETE'])
def clear_logs(tool_id):
    if tool_id in tool_logs:
        tool_logs[tool_id].clear()
    return jsonify({"status": "cleared"})

@app.route('/workspaces', methods=['GET'])
def get_workspaces():
    config = _read_config()
    return jsonify(config.get('workspaces', {}))

@app.route('/workspaces', methods=['POST'])
def save_workspace():
    data = request.json
    config = _read_config()
    if 'workspaces' not in config:
        config['workspaces'] = {}
    name = data.get('name')
    if name:
        config['workspaces'][name] = data
        _write_config(config)
    return jsonify(config.get('workspaces', {}))

@app.route('/workspaces/<name>', methods=['DELETE'])
def delete_workspace(name):
    config = _read_config()
    if 'workspaces' in config and name in config['workspaces']:
        del config['workspaces'][name]
        # Move tools to Geral
        for t in config.get('tools', []):
            if t.get('category') == name:
                t['category'] = 'Geral'
        _write_config(config)
    return jsonify({"status": "deleted"})

@app.route('/workspaces/<old_name>', methods=['PUT'])
def rename_workspace(old_name):
    data = request.json
    new_name = data.get('new_name')
    if not new_name or old_name == new_name:
        return jsonify({"status": "ignored"})
        
    config = _read_config()
    if 'workspaces' in config and old_name in config['workspaces']:
        ws_data = config['workspaces'].pop(old_name)
        ws_data['name'] = new_name
        config['workspaces'][new_name] = ws_data
        
        # Update tools
        for t in config.get('tools', []):
            if t.get('category') == old_name:
                t['category'] = new_name
        
        _write_config(config)
    return jsonify({"status": "renamed"})

@app.route('/workspaces/<name>/toggle', methods=['POST'])
def toggle_workspace_route(name):
    action = request.json.get('action', 'toggle') # 'start', 'stop', or 'toggle'
    config = _read_config()
    tools_in_ws = [t for t in config['tools'] if t.get('category', 'Geral') == name]
    
    # Determine toggle action: if any tool is stopped, start all. If all running, stop all.
    if action == 'toggle':
        any_stopped = any(t['id'] not in processes or processes[t['id']].poll() is not None for t in tools_in_ws)
        action = 'start' if any_stopped else 'stop'
        
    for t in tools_in_ws:
        tid = t['id']
        running = tid in processes and processes[tid].poll() is None
        if action == 'start' and not running:
            toggle_tool(tid)
        elif action == 'stop' and running:
            stop_tool(tid)
            
    return jsonify({"status": "ok"})

def read_output(process, tool_id):
    for line in iter(process.stdout.readline, ''):
        if tool_id in tool_logs:
            tool_logs[tool_id].append(line)
        else:
            break
    process.stdout.close()
    if tool_id in tool_logs:
        process.wait()
        tool_logs[tool_id].append(f"\n[System] Processo encerrado com código {process.returncode}.\n")

@app.route('/tools/<tool_id>/toggle', methods=['POST'])
def toggle_tool(tool_id):
    if tool_id in processes and processes[tool_id].poll() is None:
        stop_tool(tool_id)
    else:
        # Start tool
        config = _read_config()
        tool = next((t for t in config['tools'] if t['id'] == tool_id), None)
        if tool:
            try:
                cmd_str = tool['command']
                if cmd_str.lower().endswith('.lnk') and os.name == 'nt':
                    try:
                        ps_cmd = ['powershell', '-Command', f"(New-Object -COM WScript.Shell).CreateShortcut('{cmd_str}') | Select-Object TargetPath, Arguments, WorkingDirectory | ConvertTo-Json"]
                        res = subprocess.run(ps_cmd, capture_output=True, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
                        import json
                        lnk_data = json.loads(res.stdout)
                        if lnk_data and lnk_data.get('TargetPath'):
                            target = f'"{lnk_data["TargetPath"]}"'
                            if lnk_data.get('Arguments'):
                                target += f' {lnk_data["Arguments"]}'
                            cmd_str = target
                            if not tool.get('directory') and lnk_data.get('WorkingDirectory'):
                                tool['directory'] = lnk_data['WorkingDirectory']
                    except Exception as e:
                        print("Error resolving LNK:", e)
                
                cmd_list = shlex.split(cmd_str)
                    
                cwd = tool.get('directory') or None
                if cwd and not os.path.exists(cwd):
                    cwd = None
                
                env = os.environ.copy()
                env_vars_str = tool.get('env_vars', '')
                if env_vars_str:
                    for line in env_vars_str.split('\n'):
                        line = line.strip()
                        if '=' in line:
                            k, v = line.split('=', 1)
                            env[k.strip()] = v.strip()
                            
                if tool.get('auto_port', False):
                    free_port = find_free_port()
                    if free_port:
                        env['PORT'] = str(free_port)
                        active_ports[tool_id] = free_port
                        tool_logs[tool_id] = deque(maxlen=500)
                        tool_logs[tool_id].append(f"[System] Porta {free_port} atribuída automaticamente.\n")
                else:
                    tool_logs[tool_id] = deque(maxlen=500)
                
                creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                tool_logs[tool_id].append(f"[System] Iniciando comando: {cmd_str}\n")
                
                p = subprocess.Popen(cmd_list, cwd=cwd, env=env, creationflags=creationflags, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
                processes[tool_id] = p
                
                t = threading.Thread(target=read_output, args=(p, tool_id), daemon=True)
                t.start()
                
            except Exception as e:
                print(f"Error starting tool: {e}")
                if tool_id not in tool_logs:
                    tool_logs[tool_id] = deque(maxlen=500)
                tool_logs[tool_id].append(f"Error starting tool: {e}\n")
    return get_tools()

def _kill_process(pid):
    subprocess.run(['taskkill', '/F', '/T', '/PID', str(pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def stop_tool(tool_id):
    if tool_id in processes:
        p = processes[tool_id]
        if p.poll() is None:
            if os.name == 'nt':
                threading.Thread(target=_kill_process, args=(p.pid,), daemon=True).start()
            else:
                p.terminate()
        del processes[tool_id]
        if tool_id in active_ports:
            del active_ports[tool_id]

def start_auto_tools():
    config = _read_config()
    for tool in config.get('tools', []):
        if tool.get('auto_start', False):
            # Simulate a request to toggle to start it safely
            with app.test_request_context(f'/tools/{tool["id"]}/toggle', method='POST'):
                toggle_tool(tool['id'])

if __name__ == '__main__':
    start_auto_tools()
    app.run(port=5555, debug=False)
