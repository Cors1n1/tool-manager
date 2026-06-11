import os
import json
import uuid
import socket
import shlex
import subprocess
import threading
import psutil
from collections import deque
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

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
