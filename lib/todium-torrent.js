/*
 * benc2json
 * https://github.com/pwmckenna/benc2json
 *
 * Copyright (c) 2013 Patrick Williams
 * Licensed under the MIT license.
 */

var express = require('express');
var app = express();
var q = require('q');
var URL = require('url');
require('bufferjs');
var _ = require('underscore');
var ntread = require('./nt/read').readURL;

var Firebase = require('./firebase-node');
var FirebaseTokenGenerator = require("./firebase-token-generator-node.js");

if(!process.env.FIREBASE_SECRET) {
    console.error('FIREBASE_SECRET not available in the current environment');
    process.exit(1);
}

var tokenGenerator = new FirebaseTokenGenerator(process.env.FIREBASE_SECRET);
var token = tokenGenerator.createToken({}, {
    admin: true
});
var firebase = new Firebase('https://todium.firebaseio.com/');

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

var serveEditedTorrentFile = function(res, torrent, tracker) {
    console.log('serving torrent with tracker');
    console.log('torrent', torrent);
    console.log('tracker', tracker);

    ntread(torrent, function(err, torrent) {
        // maybe not a valid torrent file?
        if(err) {
            console.log('unable to read torrent file', err);
            res.writeHead(400);
            res.end();
            return;
        }

        // set the main tracker to our tracker
        if(torrent.metadata.hasOwnProperty('announce-list')) {
            torrent.metadata['announce-list'].push([tracker]);
        } else {
            torrent.metadata['announce-list'] = [[tracker], [torrent.metadata.announce]];
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
        });
    });
};

var handleParameterRequest = function(req, res) {
    var query = URL.parse(req.url, true).query;
    if(!query.hasOwnProperty('torrent')) {
        res.writeHead(400);
        res.end('no torrent specified');
        return;
    }
    if(!query.hasOwnProperty('tracker')) {
        res.writeHead(400);
        res.end('no tracker specified');
        return;
    }
    serveEditedTorrentFile(res, query['torrent'], query['tracker']);
};

var handleShortenedTorrentLink = function(req, res) {
    var link = req.params.link;
    firebase.child('torrent').child(link).once('value', function(valueSnapshot) {
        var value = valueSnapshot.val();
        var torrent = value.torrent;
        var tracker = value.tracker;
        console.log('torrent', torrent);
        console.log('tracker', tracker);

        serveEditedTorrentFile(res, torrent, tracker);
    });
};

//support the case where someone wants to name their torrent
app.get('/:link/:name.torrent', handleShortenedTorrentLink);
//support the random link name
app.get('/:link.torrent', handleShortenedTorrentLink);
//support the case where someone wants to specify the torrent and tracker themselves
app.get('/', handleParameterRequest);

var port = process.env.PORT || 5000;
var onAuth = function(error, dummy) {
    if(!error) {
        console.log('firebase login success');
        app.listen(port, function() {
            console.log('Listening on ' + port);
        });
    } else {
        console.log('firebase login failure');
        process.exit(1);
    }
};
firebase.auth(token, onAuth);