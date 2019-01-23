const argv = require('minimist')(process.argv);
const { app, BrowserWindow } = require('electron');
const autodiscover = require("./autodiscover.js");


// 1) app init
// 2) open main window
// 3) wait for server connection
var win;

console.log("Main app, %d", process.pid, argv);
console.log("Frameless: ", Boolean(argv.frameless ? false : true));

function createWindow() {

    win = new BrowserWindow({
        show: false,
        frame: argv.frameless ? false : true
    });


    win.once('ready-to-show', () => {

        console.log("Show main window");

        if (argv.fullscreen) {

            // fullscreen
            win.setFullScreen(true);

        } else {

            // maximize
            win.maximize();

        }

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