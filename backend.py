import os
import json
import uuid
import shlex
import subprocess
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

CONFIG_FILE = "config.json"
processes = {}

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
    return jsonify(config['tools'])

@app.route('/tools', methods=['POST'])
def add_tool():
    data = request.json
    config = _read_config()
    tool_id = str(uuid.uuid4())
    config['tools'].append({
        "id": tool_id,
        "name": data.get("name"),
        "command": data.get("command"),
        "directory": data.get("directory", "")
    })
    _write_config(config)
    return get_tools()

@app.route('/tools/<tool_id>', methods=['DELETE'])
def remove_tool(tool_id):
    if tool_id in processes:
        stop_tool(tool_id)
    config = _read_config()
    config['tools'] = [t for t in config['tools'] if t['id'] != tool_id]
    _write_config(config)
    return get_tools()

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
                        # Resolve lnk to target with arguments and working directory
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
                
                # Prevent python.exe from opening a CMD window by using pythonw.exe
                if cmd_list and cmd_list[0].lower().endswith('python.exe'):
                    cmd_list[0] = cmd_list[0][:-10] + 'pythonw.exe'
                    
                cwd = tool.get('directory') or None
                if cwd and not os.path.exists(cwd):
                    cwd = None
                
                creationflags = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
                p = subprocess.Popen(cmd_list, cwd=cwd, creationflags=creationflags)
                processes[tool_id] = p
            except Exception as e:
                print(f"Error starting tool: {e}")
    return get_tools()

def stop_tool(tool_id):
    if tool_id in processes:
        p = processes[tool_id]
        if p.poll() is None:
            if os.name == 'nt':
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            else:
                p.terminate()
        del processes[tool_id]

if __name__ == '__main__':
    app.run(port=5555, debug=False)
