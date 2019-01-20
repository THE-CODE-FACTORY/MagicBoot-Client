const os = require("os");
const fs = require("fs");
const path = require("path");
const util = require("util");
const si = require("systeminformation");
const child = require("child_process");
const { BrowserWindow } = require('electron');
const argv = require('minimist')(process.argv);



module.exports = function (socket, parent) {

    //var title = "KEIN----";
    var computer, config;
    var actions = {};


    const countdown = function (cb) {

        var counter = 10;

        setInterval(function () {

            counter--;

            parent.webContents.send("progress", {
                title: `Autostart in ${counter}s`,
                precent: 0
            });

            if (counter === 0) {

                clearInterval(this);
                cb();

            }

        }, 1000);

    };


    const autostart = function autostart() {
        switch (computer.state) {
            case "loaded":

                // proceed windows installation
                console.log("Autostart: install");
                actions.install();

                break;
            case "cloned":

                // proceed post-install tasks
                console.log("Autostart: tasks");
                actions.tasks();

                break;
            default:

                // autostart default
                console.log("Autostart: default action,", computer.state);

                break;

        }
    };


    //socket.on("autostart", () => {
    setTimeout(() => {
        if (argv.autostart && computer) {

            // feedback
            console.log("Countdown start");

            // start countdown
            countdown(() => {

                console.log("Countdown end");
                autostart();

            });

        } else {

            console.log("AUTOSTART FEHLER:");
            console.log("Enabled: ", argv.autostart);
            console.log("Computer: ", computer);

        }
    }, 1000);
    //});



    const helper = require("./helper.js")(computer, config);


    /**
     * Helper function for callbacks
     * @param {*} i 
     * @param {*} done 
     */
    function queue(i, done) {

        var data = {};

        console.log("create queue, ", i)

        return function (key, value) {

            i--;

            console.log("decremented, %s", key, i);

            data[key] = value;

            if (i === 0) {
                console.log("i = 0, done called");
                done(data);
            }

        };

    }


    /**
     * Helper function for system info
     * @param {*} cb 
     */
    function system(cb) {

        // functions we want to cal
        const info = [
            "system",
            "bios",
            "baseboard",
            "cpu",
            "mem",
            "battery",
            //"graphics", -> GEHT IN PE NICHT!!!! @FIXME
            "blockDevices",
            "networkInterfaces",
            "networkInterfaceDefault"
        ];

        console.log("queue length", info.length);

        // callback queue
        const done = queue(info.length, function (data) {

            console.log("in system, cb", data);
            socket.emit("systeminfo", data);
            cb(data);

        });

        info.forEach(function (name) {
            si[name](data => done(name, data))
        });

    };


    /**
     * Open Terminal (cmd.exe)
     */
    actions.terminal = function () {

        const terminal = child.spawn("cmd.exe", {
            detached: true,
            shell: true,
            stdio: ['ignore']
        });

        terminal.unref();

    };


    /**
     * Register computer on server
     */
    actions.register = function register() {

        parent.webContents.send("progress", {
            title: "Register Computer...",
            precent: 0
        });

        si.networkInterfaceDefault(name => {
            si.networkInterfaces(interfaces => {

                console.log("interface...", interfaces)

                // find default interface
                // hope this is what we connected over
                const iface = interfaces.find(function (info) {
                    return info.iface === name;
                });

                console.log("default interface", iface);

                system(data => {
                    //si.system(system => {

                    console.log("data", data)

                    // get timestamp
                    const ts = new Date().getTime();

                    const template = {
                        name: ts,
                        uuid: (data.system && data.system.uuid) || null,
                        hostname: ts,
                        mac: iface.mac,
                        systeminfo: data
                    };

                    socket.emit("register", template, (err, computer) => {

                        if (err) {

                            parent.webContents.send("progress", {
                                title: "Error: " + err.message,
                                precent: 0
                            });

                            return console.log("There was a error, ", err);
                        }

                        console.log("Successful Registered!");

                        parent.webContents.send("progress", {
                            title: "Successful Registered",
                            precent: 100
                        });

                    });

                    //)});
                });

            });
        });


    };


    /**
     * Install windows image
     * @param {object} computer 
     */
    actions.install = function install() {

        // 1. creat diskpart script
        // 2. run diskpart
        // 3. mount samba/cifs share
        // 4. apply image with dism        

        if (!computer || !computer.image || !computer.image.resource) {

            console.log("Not register nor image assinged!");
            socket.emit("installation.failure", "NO_IMAGE-NOT_REGISTERD");
            return;

        }

        socket.emit("installation.prepare");

        parent.webContents.send("progress", {
            title: "Prepare for installation",
            precent: 0
        });


        // select & clean disk
        var command = "select disk 0" + os.EOL;
        command += "clean" + os.EOL;

        // create bootloader patrition
        command += "create partition primary size=300" + os.EOL;
        command += "format quick fs=ntfs label='System'" + os.EOL;
        command += "assign letter='S'" + os.EOL;
        command += "active" + os.EOL;

        // create windows partition
        command += "create partition primary " + os.EOL;
        command += "format quick fs=ntfs label='Windows' " + os.EOL;
        command += "assign letter='C'" + os.EOL;
        command += "exit" + os.EOL;


        fs.writeFile(path.resolve(os.tmpdir(), "diskpart.txt"), command, function (err) {

            if (err) {
                console.log(err);
                socket.emit("installation.failure", err.message);
                return;
            }

            // create diskpart script in temp file
            // after that, create the hdd layout
            const diskpart = child.exec("diskpart.exe -s " + path.resolve(os.tmpdir(), "diskpart.txt"), function (err, stdout, stderr) {

                if (err) {
                    console.log(err, stdout, stderr);
                    socket.emit("installation.failure", err.message);
                    return;
                }


                console.log("Diskpart done...");


                // mount image share
                // apply image with dism
                (function () {

                    // build mount command
                    var command = "net use I: " + config.images.location + " ";

                    //@TODO Schöner machen...
                    if (config.images.authentication && config.images.authentication.enabled) {
                        command += "/user:";
                        command += config.images.authentication.domain;
                        command += config.images.authentication.username + " ";
                        command += config.images.authentication.password + " ";
                    }

                    command += "/PERSISTENT:YES";

                    console.log();
                    console.log("CMD>>", command);
                    console.log();

                    const netUse = child.exec(command, function (err, stdout, stderr) {

                        if (err) {
                            console.log(err, stdout, stderr);
                            socket.emit("installation.failure", err.message);
                            return;
                        }


                        console.log("net use done");


                        // apply image to hdd
                        // create bootloader from image
                        (function () {

                            socket.emit("installation.start");

                            const dism = child.exec("dism.exe /apply-image /imagefile:I:\\" + computer.image.resource + "  /index:" + (computer.image.index || "1") + " /ApplyDir:C:\\", function (err, stdout, stderr) {

                                if (err) {
                                    console.log(err, stdout, stderr);
                                    socket.emit("installation.failure", err.message);
                                    return;
                                }


                                console.log("image applyed!!!");


                                // create bootloader from image
                                (function () {

                                    const bcd = child.exec("C:\\Windows\\System32\\bcdboot.exe C:\\Windows /l en-US", function (err, stdout, stderr) {

                                        if (err) {
                                            console.log(err, stdout, stderr);
                                            socket.emit("installation.failure", err.message);
                                            return;
                                        }

                                        console.log("IMAGE APPLYING DONE!");
                                        socket.emit("installation.success");

                                        setTimeout(function () {
                                            try {

                                                // reboot computer
                                                child.execSync("wpeutil reboot");

                                            } catch (err) {

                                                console.log(err);

                                            }
                                        }, 1000);

                                    });

                                    if (process.env.NODE_ENV !== "production") {
                                        bcd.stdout.pipe(process.stdout);
                                        bcd.stderr.pipe(process.stderr);
                                    }

                                })();


                            });

                            const handleProgress = function handleProgress(str) {

                                str = util.inspect(str);
                                console.log("DEBUG >>", str);

                                if (str.substring(0, 4) == "'\\r[") {

                                    let precent = str.split("%")[0];
                                    precent = precent.replace(/=/g, "");
                                    precent = precent.substring(4);
                                    precent = Number(precent);

                                    console.log(">> done %d%%", precent);
                                    socket.emit("installation.progress", precent);

                                    // update progress bar in render
                                    parent.webContents.send("progress", {
                                        title: "Windows installing...",
                                        precent: precent
                                    });

                                } else {

                                    // normal "stat" feedback
                                    console.log("IN CB", str)

                                }

                            };



                            // calculate/parse progress from dism
                            dism.stdout.on("data", handleProgress);
                            dism.stderr.on("data", handleProgress);


                            // pipe stdout/stdout
                            if (process.env.NODE_ENV !== "production") {
                                dism.stdout.pipe(process.stdout);
                                dism.stderr.pipe(process.stderr);
                            }

                        })();

                    });

                    if (process.env.NODE_ENV !== "production") {
                        netUse.stdout.pipe(process.stdout);
                        netUse.stderr.pipe(process.stderr);
                    }

                })();

            });


            if (process.env.NODE_ENV !== "production") {
                diskpart.stdout.pipe(process.stdout);
                diskpart.stderr.pipe(process.stderr);
            }

        });

    };


    /**
     * Captrue windows image
     */
    actions.capture = function capture() {

        socket.emit("capture.start");


        parent.webContents.send("progress", {
            title: "Capture Image (Windows Partition) @TODO!!!!",
            precent: 0
        });

        return;


        helper.mountShare(function (err) {

            if (err) {
                socket.emit("capture.failure", "Could not mount image share");
            }



            const dism = child.exec("dism.exe /ca /imagefile:I:\\" + computer.image.resource + " /index:" + computer.image.index + " /ApplyDir:C:\\", function (err, stdout, stderr) {

                if (err) {
                    console.log(err, stdout, stderr);
                    socket.emit("installation.failure", err.message);
                    return;
                }

            });

            dism.stdout.pipe(process.stdout);
            dism.stderr.pipe(process.stderr);


        });




    };


    /**
     * Show hardware information
     */
    actions.hardware = function () {

        var timeout = 1000;
        console.log("hardware called")

        let win = new BrowserWindow({
            show: false,
            height: 600,
            width: 800,
            parent: parent,
            modal: true,
            show: false
        });

        win.setMenu(null);
        win.loadFile('./templates/hardware.html');

        win.once('ready-to-show', () => {

            if (argv.inspect) {
                timeout = 10000;
                win.webContents.openDevTools();
            }

            // collect system information
            system(function (data) {

                console.log("Hardware:", data)

                setTimeout(function () {
                    if (win) {

                        // send hardware to window
                        win.webContents.send("hardware", data);

                    } else {

                        console.log("Window destroyed");

                    }
                }, timeout);


                // show window
                //win.maximize();
                win.show();

            });


        });

    };


    /**
     * Proceed tasks
     */
    actions.tasks = function tasks() {

        if (["cloned", "tasks"].indexOf(computer.state) === -1) {
            console.log("Installation nicht abgeschlossen!");
            return;
        }

        parent.webContents.send("progress", {
            title: "Proceed Tasks...",
            precent: 0
        });

        // for calculating progrees bar
        var tasksTotal = 0;
        var tasksComplete = 0;


        // listen for task from server
        socket.on("task", (task) => {

            // feedback
            console.log("Proceed taks '%s'", task.name);

            // spawn cild / execute command
            child.exec(task.command, Object.assign({
                windowsHide: true
            }, tasks.options), (err, stdout, stderr) => {

                if (err) {
                    console.log("Task error, ", err);
                    socket.emit("task.error", err);
                    return;
                }

                // task successful executed
                socket.emit("task.done");
                tasksComplete++;

                // calculate precent 
                let precent = (tasksComplete / tasksTotal) * 100;

                // update progress bar in render
                parent.webContents.send("progress", {
                    title: "Task " + tasksComplete + " von " + tasksTotal,
                    precent: precent
                });

                if (tasksComplete === tasksTotal) {
                    console.log("Looks like we were done here...");
                }

            });

        });


        // get tasks from server
        socket.emit("tasks", function (total, current) {

            // calculate            
            tasksTotal = total || 0;
            tasksComplete = current || 0;
            console.log("Total Tasks, %d/%d", current, total);

        });

    };


    /**
     * Shutdown the computer
     */
    actions.shutdown = function shutdown() {
        child.exec("wpeutil shutdown", (err) => {

            if (err) {
                try {

                    // try windows
                    child.execSync("shutdown -s -t 0");

                } catch (error) {

                    console.log("shutdown.exe error,", error)

                } finally {

                    console.log("wpeutil, ", err)

                }
            }

        });
    };


    /**
     * Reboot the computer
     */
    actions.reboot = function reboot() {
        child.exec("wpeutil reboot", (err) => {

            if (err) {
                try {

                    // try windows
                    child.execSync("shutdown -r -t 0");

                } catch (error) {

                    console.log("shutdown.exe error,", error)

                } finally {

                    console.log("wpeutil, ", err)

                }
            }

        });
    };


    /**
     * Return actions
     * set computer (self info)
     */
    return {
        actions: actions,
        set: function (pc, cfg) {
            computer = pc;
            config = cfg;
        },
        hardware: function () {
            system(function () {

                console.log("system function called")

            });
        }
    };

};