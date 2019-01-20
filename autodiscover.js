const dgram = require("dgram");
const io = require("socket.io-client");
const { app, ipcMain } = require("electron");
const argv = require('minimist')(process.argv);

module.exports = function (win) {

    const PORT = 6024;
    const client = dgram.createSocket('udp4');

    var socket;


    client.on('listening', () => {

        const address = client.address();
        client.setBroadcast(true);

        // feedback
        console.log('UDP Client listening on %s:%d', address.address, address.port);

    });


    client.on('message', (message, rinfo) => {

        try {
            if (!socket || !socket.connected) {


                // parse message & feedback
                const m = JSON.parse(message);
                console.log(m, message.toString())


                // connect to server
                // broadcasted from autodiscover
                socket = io(`${m["http"].protocol}://${m["http"].host}:${m["http"].port}/client`, {
                    transports: ["websocket"]
                });


                // liste for disconnect from server
                // display overlay in render process
                socket.on("disconnect", () => {

                    console.log("Disconnected");
                    win.webContents.send("socket.disconnect");

                });


                // feedback to what we try to connect
                // great if we received bullshit from another app
                socket.on("connecting", () => {

                    const opts = socket.io.opts;
                    console.log("Trying to connected to server %s:%d", opts.hostname, opts.port);

                });


                // liste for connection to server
                // hide overlay in render process
                socket.on("connect", () => {

                    const opts = socket.io.opts;
                    console.log("Connected to %s:%d", opts.hostname, opts.port);
                    //win.loadFile("templates/dashboard.html");

                    //setTimeout(function () {
                    win.webContents.send("socket.connect");
                    //}, 1000);

                    // poke server
                    // we want infos
                    socket.emit("poke");

                });


                // listen for poked event
                // information about ourself
                socket.once("poked", (computer, config) => {

                    // required handler
                    const handler = require("./handler.js")(socket, win);
                    handler.set(computer, config);


                    // listen for events from frontend
                    // handle in main process
                    ipcMain.on('action', (event, action) => {
                        if (action === "exit") {

                            //win.close();
                            app.quit();

                        } else {
                            if (handler.actions[action]) {

                                // call action in handler
                                console.log("Call handler for action: %s", action)
                                handler.actions[action]();

                            } else {

                                console.log("Handler/Aaction '%s' invalid", action)

                            }
                        }
                    });

                });


            }
        } catch (err) {

            // feedback
            console.log("Could not parse message", err);

        }

        //console.log('Message from: %s:%d', rinfo.address, rinfo.port);
        //console.log(message.toString());

    });


    client.bind(PORT);

};