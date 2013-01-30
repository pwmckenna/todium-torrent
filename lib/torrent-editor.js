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
var q = require('q');
require('bufferjs');
var _ = require('lodash');

var getTorrentReadStream = function(torrent) {
    var ret = new q.defer();
    var torrentStream = torrent.createReadStream();
    var buffers = [];
    torrentStream.addListener('data', function(buffer) {
        buffers.push(buffer);
    });
    torrentStream.addListener('end', function() {
        ret.resolve(Buffer.concat(buffers));
    });
    return ret.promise;
}

var port = process.env.PORT || 5000;
http.createServer(function(req, res) {
    var query = URL.parse(req.url, true).query;

    // if we don't have a url argument, then lets bail
    if(!query.hasOwnProperty('torrent')) {
        console.log('error', 'no torrent url');
        res.writeHead(400);
        res.end();
        return;
    }

    // check if we have a tracker to splice into the torrent
    if(!query.hasOwnProperty('tracker')) {
        console.log('error', 'no tracker url');
        res.writeHead(400);
        res.end();
        return;
    }

    var torrent = query['torrent'];
    var tracker = query['tracker'];
    console.log('torrent', torrent);
    console.log('tracker', tracker);
    nt.read(torrent, function(err, torrent) {
        // maybe not a valid torrent file?
        if(err) {
            console.log('unable to read torrent file', err);
            res.writeHead(400);
            res.end();
            return;
        }

        // set the main tracker to our tracker
        if(torrent.metadata.hasOwnProperty('announce-list')) {
            if(torrent.metadata['announce-list'].length > 0 && _.isArray(torrent.metadata['announce-list'][0])) {
                torrent.metadata['announce-list'].push([tracker]);
            } else {
                torrent.metadata['announce-list'].push(tracker);
            }
        } else {
            torrent.metadata.announce = tracker;
        }

        // now create a read stream and dump it into our response stream
        var torrentReadStreamRequest = getTorrentReadStream(torrent);
        torrentReadStreamRequest.done(function(data) {
            res.writeHead(200, {
                'Content-Type': 'application/x-bittorrent',
                'Content-Disposition': 'inline; filename="' + torrent.metadata.info.name + '.torrent"'
            });
            res.end(data);
        });
        torrentReadStreamRequest.fail(function() {
            console.log('unable to get torrent file stream');
            res.writeHead(400);
            res.end();
            return;
        })
    });
}).listen(port, function() {
    console.log('Listening on ' + port);
});