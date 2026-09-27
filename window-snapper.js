const net = require('net');

class WindowSnapper {
    constructor(mainWindow, appId) {
        this.mainWindow = mainWindow;
        this.appId = appId;
        this.otherBounds = {};
        this.client = new net.Socket();
        this.client.setNoDelay(true);
        this.THRESHOLD = 20; // 20 pixels snapping distance
        
        this.isSnapping = false;
        this.expectedBounds = null; // Used to prevent infinite loops when forced to move
        this.currentPinState = false;

        this.connect();

        // Broadcast bounds when resized
        this.mainWindow.on('resized', () => {
            if (this.isSnapping) return;
            this.sendBounds();
        });

        // Trigger magnetic snap on mouse release
        this.mainWindow.on('moved', () => {
            if (this.isSnapping) return;
            this.expectedBounds = null; // Reset
            this.handleSnap();
            this.sendBounds();
        });

        // Handle micro-movements for group dragging
        this.mainWindow.on('will-move', (event, newBounds) => {
            if (this.isSnapping) return;
            
            // If this will-move is caused by our programmatic setBounds, ignore it
            if (this.expectedBounds && 
                Math.abs(newBounds.x - this.expectedBounds.x) <= 2 && 
                Math.abs(newBounds.y - this.expectedBounds.y) <= 2) {
                return;
            }
            
            this.expectedBounds = null;
            const currentBounds = this.mainWindow.getBounds();
            const dx = newBounds.x - currentBounds.x;
            const dy = newBounds.y - currentBounds.y;
            
            if (dx !== 0 || dy !== 0) {
                // Only tool_manager pulls the group. Others can detach easily.
                if (this.appId === 'tool_manager') {
                    try {
                        this.client.write(JSON.stringify({
                            type: 'drag',
                            id: this.appId,
                            bounds: newBounds
                        }) + '\n');
                    } catch (e) {}
                }
            }
        });
    }

    connect() {
        this.client.connect(15555, '127.0.0.1', () => {
            console.log(`[WindowSnapper] Connected to broker as ${this.appId}`);
            this.sendBounds();
        });

        this.client.on('data', (data) => {
            try {
                const msgs = data.toString().split('\n');
                msgs.forEach(msg => {
                    if (!msg.trim()) return;
                    const parsed = JSON.parse(msg);
                    
                    if (parsed.type === 'sync') {
                        this.otherBounds = parsed.bounds;
                    }
                    else if (parsed.type === 'force-move' && parsed.id === this.appId) {
                        this.expectedBounds = parsed.bounds;
                        this.mainWindow.setBounds(parsed.bounds);
                        if (this.currentPinState) {
                            this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
                        }
                    }
                    else if (parsed.type === 'pin-state') {
                        if (this.appId !== 'tool_manager') {
                            this.currentPinState = parsed.isPinned;
                            this.mainWindow.setAlwaysOnTop(parsed.isPinned, 'screen-saver');
                        }
                    }
                    else if (parsed.type === 'visibility' && parsed.id === this.appId) {
                        if (parsed.visible) {
                            this.mainWindow.showInactive();
                        } else {
                            this.mainWindow.hide();
                        }
                    }
                });
            } catch (e) {
                console.error('[WindowSnapper] Error parsing data:', e);
            }
        });

        this.client.on('close', () => {
            console.log('[WindowSnapper] Disconnected. Reconnecting in 3s...');
            setTimeout(() => this.connect(), 3000);
        });

        this.client.on('error', (err) => {
            // Ignore connection refused if broker isn't up yet
        });
    }

    sendBounds() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        const bounds = this.mainWindow.getBounds();
        try {
            this.client.write(JSON.stringify({
                type: 'update',
                id: this.appId,
                bounds: bounds
            }) + '\n');
        } catch (e) {}
    }

    handleSnap() {
        if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
        
        let bounds = this.mainWindow.getBounds();
        let snapped = false;

        for (const [id, other] of Object.entries(this.otherBounds)) {
            if (id === this.appId) continue;
            if (!other) continue;

            const yOverlap = (bounds.y - this.THRESHOLD <= other.y + other.height) && (bounds.y + bounds.height + this.THRESHOLD >= other.y);
            const xOverlap = (bounds.x - this.THRESHOLD <= other.x + other.width) && (bounds.x + bounds.width + this.THRESHOLD >= other.x);

            let snappedX = false;
            let snappedY = false;

            if (yOverlap) {
                if (Math.abs((bounds.x + bounds.width) - other.x) <= this.THRESHOLD) {
                    bounds.x = other.x - bounds.width;
                    snapped = true; snappedX = true;
                } else if (Math.abs(bounds.x - (other.x + other.width)) <= this.THRESHOLD) {
                    bounds.x = other.x + other.width;
                    snapped = true; snappedX = true;
                } else if (Math.abs(bounds.x - other.x) <= this.THRESHOLD) {
                    bounds.x = other.x;
                    snapped = true; snappedX = true;
                } else if (Math.abs((bounds.x + bounds.width) - (other.x + other.width)) <= this.THRESHOLD) {
                    bounds.x = other.x + other.width - bounds.width;
                    snapped = true; snappedX = true;
                }
            }

            if (xOverlap) {
                if (Math.abs((bounds.y + bounds.height) - other.y) <= this.THRESHOLD) {
                    bounds.y = other.y - bounds.height;
                    snapped = true; snappedY = true;
                } else if (Math.abs(bounds.y - (other.y + other.height)) <= this.THRESHOLD) {
                    bounds.y = other.y + other.height;
                    snapped = true; snappedY = true;
                } else if (Math.abs(bounds.y - other.y) <= this.THRESHOLD) {
                    bounds.y = other.y;
                    snapped = true; snappedY = true;
                } else if (Math.abs((bounds.y + bounds.height) - (other.y + other.height)) <= this.THRESHOLD) {
                    bounds.y = other.y + other.height - bounds.height;
                    snapped = true; snappedY = true;
                }
            }

            if (snappedX || snappedY) {
                break;
            }
        }

        if (snapped) {
            this.isSnapping = true;
            this.expectedBounds = bounds;
            this.mainWindow.setBounds(bounds);
            if (this.currentPinState) {
                this.mainWindow.setAlwaysOnTop(true, 'screen-saver');
            }
            setTimeout(() => {
                this.isSnapping = false;
                this.sendBounds();
            }, 100);
        } else {
            this.sendBounds();
        }
    }
}

module.exports = WindowSnapper;
