/*
 * benc2json
 * https://github.com/pwmckenna/benc2json
 *
 * Copyright (c) 2013 Patrick Williams
 * Licensed under the MIT license.
 */

var http = require('http');
var URL = require('url');
var nt = require('nt');
var util = require('util');

var headers = {
    'Content-Type': 'application/x-bittorrent'
};


var port = process.env.PORT || 5000;
http.createServer(function(req, res) {
    var query = URL.parse(req.url, true).query;
    console.log(query);

    // if we don't have a url argument, then lets bail
    if(!query.hasOwnProperty('torrent')) {
        res.writeHead(400);
        res.end();
        return;
    }

    var torrent = query['torrent'];
    nt.read(torrent, function(err, torrent) {
        if(err) {
            res.writeHead(400);
            util.pump(torrent.createReadStream(), res);
            return;
        }

        res.writeHead(200, headers);
        res.end();
    });
}).listen(port, function() {
    console.log('Listening on ' + port);
});