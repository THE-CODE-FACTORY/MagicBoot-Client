const argv = require('minimist')(process.argv);
const { app, BrowserWindow } = require('electron');
const autodiscover = require("./autodiscover.js");


// 1) app init
// 2) open main window
// 3) wait for server connection
var win;

console.log("Main app, %d", process.pid, argv);

function createWindow() {

    win = new BrowserWindow({
        show: false
    });


    win.once('ready-to-show', () => {

        console.log("Show main window");

        win.maximize();
        win.show();

    });


    if (argv.inspect) {
        win.webContents.openDevTools();
    }


    win.setMenu(null);
    //win.loadFile("templates/connecting.html");
    win.loadFile("templates/dashboard.html");

    return win;

}


app.on('ready', () => {

    // feedback
    console.log("Electron is ready");

    // create main window
    // wait for server broadcast
    win = createWindow();
    autodiscover(win);

});