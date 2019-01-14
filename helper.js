const si = require("systeminformation");
const child = require("child_process");
const os = require("os");
const fs = require("fs");
const path = require("path");
const util = require("util");

module.exports = function (computer, config) {

    var methods = {};


    /**
     * Mount image sharepoint
     */
    methods.mountShare = function mount(cb) {


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
                return cb(err);
            }


            cb(null, stdout);

        });

    };

};