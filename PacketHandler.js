var Cell = require('./Cell');
var Packet = require('./packet');

function PacketHandler(gameServer, socket) {
    this.gameServer = gameServer;
    this.socket = socket;
}

module.exports = PacketHandler;

PacketHandler.prototype.handleMessage = function(message) {
    function stobuf(buf) {
        var length = buf.length;
        var arrayBuf = new ArrayBuffer(length);
        var view = new Uint8Array(arrayBuf);

        for (var i = 0; i < length; i++) {
            view[i] = buf[i];
        }

        return view.buffer;
    }

    var buffer = stobuf(message);
    var view = new DataView(buffer);
    var packetId = view.getUint8(0, true);

    switch (packetId) {
        case 0:
            // Set Nickname
            var nick = "";
            for (var i = 1; i < view.byteLength; i += 2) {
                var charCode = view.getUint16(i, true);
                if (charCode == 0) {
                    break;
                }

                nick += String.fromCharCode(charCode);
            }
            this.setNickname(nick);
            break;
        case 16:
            // Mouse Move
            var client = this.socket.playerTracker;
            client.setMouseX(view.getFloat64(1, true));
            client.setMouseY(view.getFloat64(9, true));
			
            for (var i = 0; i < client.cells.length; i++){
                var cell = client.cells[i];
				
                if (!cell) {
                    continue;
                }
				
                cell.calcMove(client.getMouseX(), client.getMouseY(), this.gameServer.border);
                
                // Check if cells nearby (Still buggy)
                var list = this.gameServer.getCellsInRange(cell);
                for (var j = 0; j < list.length ; j++) {
                    //Remove the cells
                    var n = list[j].getType();
                    
                    switch (n) {
                        case 3: // Ejected Mass
                        case 0: // Player Cell
                            //cell.mass += n.mass; Placeholder until i get the proper formula
                            break;
                        case 1: // Food
                            this.gameServer.currentFood--;
                            cell.mass += this.gameServer.config.foodMass;
                            break;
                        case 2: // Virus
                            this.gameServer.currentViruses--;
                            break;
                        default:
                            break;
                    }
                    this.gameServer.removeNode(list[j]); 
                }
            }
            break;
		case 17: // Space Press - Split cell
            var client = this.socket.playerTracker;
            var len = client.cells.length;
            for (var i = 0; i < len; i++) {
                var cell = client.cells[i];
				
                if (client.cells.length >= this.gameServer.config.playerMaxCells) {
                    // Player cell limit
                    continue;
                }

                if (!cell) {
                    continue;
                }
				
                var deltaY = client.getMouseY() - cell.getPos().y;
                var deltaX = client.getMouseX() - cell.getPos().x;
                var angle = Math.atan2(deltaX,deltaY);
            	
                // Get starting position
                var size = cell.getSize();
                var startPos = {
                    x: cell.getPos().x + ( (size + this.gameServer.config.ejectMass) * Math.sin(angle) ), 
                    y: cell.getPos().y + ( (size + this.gameServer.config.ejectMass) * Math.cos(angle) )
                };
                // Calculate mass of splitting cell
                var newMass = cell.getMass() / 2;
                cell.setMass(newMass);
                // Create cell
                split = new Cell(this.gameServer.getNextNodeId(), client, cell.name, startPos, newMass, 0);
                split.setAngle(angle);
                split.setMoveEngineData(50, 5);
            	
                // Add to moving cells list
                this.gameServer.addMovingCell(split);
                this.gameServer.addNode(split);
				
                // Add to player screen
                this.socket.sendPacket(new Packet.AddNodes(split));
                client.addCell(split);
            }
            break;
        case 18: // Q Press (Debug)
            break;
        case 21: // W Press - Eject mass
            var client = this.socket.playerTracker;
            for (var i = 0; i < client.cells.length; i++) {
                var cell = client.cells[i];
				
                if (!cell) {
                    continue;
                }
				
                var deltaY = client.getMouseY() - cell.getPos().y;
                var deltaX = client.getMouseX() - cell.getPos().x;
                var angle = Math.atan2(deltaX,deltaY);
            	
                // Get starting position
                var size = cell.getSize();
                var startPos = {
                    x: cell.getPos().x + ( (size + this.gameServer.config.ejectMass) * Math.sin(angle) ), 
                    y: cell.getPos().y + ( (size + this.gameServer.config.ejectMass) * Math.cos(angle) )
                };
                // Create cell
                ejected = new Cell(this.gameServer.getNextNodeId(), null, "", startPos, this.gameServer.config.ejectMass, 3);
                ejected.setAngle(angle);
                ejected.setMoveEngineData(75, 6);
            	
                // Add to moving cells list
                this.gameServer.addMovingCell(ejected);
                this.gameServer.addNode(ejected);
            }
            break;
        case 255:
            // Connection
            // Send SetBorder packet first
            var border = this.gameServer.border;
            this.socket.sendPacket(new Packet.SetBorder(border.left, border.right, border.top, border.bottom));
            break;
        default:
            break;
    }
}

PacketHandler.prototype.setNickname = function(newNick) {
    var client = this.socket.playerTracker;
    if (client.cells.length < 1) {
        // If client has no cells...
        var cell = new Cell(this.gameServer.getNextNodeId(), client, newNick, this.gameServer.getRandomPosition(), 10, 0);
        client.addCell(cell);
        this.gameServer.addNode(cell);
    } else {
        for (var i = 0; i < client.cells.length; i++){
		    client.cells[i].setName(newNick);
		}
	}
    // Only add player controlled cells with this packet or it will bug the camera
    for (var i = 0; i < client.cells.length; i++){
        this.socket.sendPacket(new Packet.AddNodes(client.cells[i]));
    }
}
