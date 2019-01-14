const argv = require('minimist')(process.argv);
const { app, BrowserWindow, ipcMain } = require('electron');
const socket = require("socket.io-client")("http://172.16.0.1/client");


// globals
// garbage collection
// prevent to close the window
var handler, win = null;


console.log("minimist", argv);

socket.once("connect", function () {

    var ready = false;

    console.log("Connected to server");
    handler.hardware();

    win.once('ready-to-show', () => {
        ready = true;
    });


    socket.on("poked", (computer, config) => {

        console.log("Server poked...", computer || "Nicht Registierert");
        handler.set(computer, config);


        if (computer && argv.autostart) {

            // image/tasks checked in handler
            console.log("Computer exists & Autostart");

            if (computer.state !== "complete") {

                console.log("computer state %s", computer.state)

                setTimeout(function () {
                    let interval = setInterval(function () {
                        if (ready) {

                            clearInterval(interval);
                            console.log("autostart received from server");

                            // send to render process
                            if (computer.state !== "completed") {
                                win.webContents.send("autostart", (computer.state === "cloned" ? "tasks" : "install"));
                            } else {
                                console.log("Computer deployed....")
                            }


                        }
                    }, 1000);
                }, 5000);

            }


        }


    });


    socket.on("action", (action) => {
        if (handler.actions[action]) {

            // call action in handler
            handler.actions[action]();

        } else {

            console.log("Handler/Aaction '%s' invalid", action);

        }
    });


    setTimeout(function () {

        console.log("poke server...");
        socket.emit("poke");

    }, 1000);

});



// Attach listener in the main process with the given ID
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


// MOVE TO ACTION HANDLER!!!
/*
setInterval(function () {
    precent += 2;
    win.webContents.send("progress", {
        title: "Windows installing...",
        precent: precent
    });
}, 1000);
*/



function createWindow() {

    // Create the browser window.
    let win = new BrowserWindow({
        show: false,
        frame: (argv.noframe || true),
        //nodeIntegration: true
    });

    win.setMenu(null);


    //setInterval(function () {
    win.loadFile('./templates/dashboard.html');
    //}, 5000);

    if (argv.inspect) {
        win.webContents.openDevTools();
    }

    win.once('ready-to-show', () => {
        win.maximize();
        win.show();
    });

    return win;

}



// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function () {

    win = createWindow();
    handler = require("./handler.js")(socket, win, argv);

});