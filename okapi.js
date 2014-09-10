var Hapi = require('hapi');
var Handlebars = require('handlebars');
var Fs = require('fs-extra');
var Moment = require('moment');


var Storage = {
    newAPI: function(obj) {
        console.log(Storage.storage, obj, Storage.storage.api)
        Storage.storage.api[obj.name] = obj;
        Storage.storage.api[obj.name].added = Moment().format();
        Storage.store();
        console.log('NEW API')
    },
    deleteAPI: function(name) {
        if (Storage.storage.api.hasOwnProperty(name)) {
            delete Storage.storage.api[name];
            Storage.store();
            Fs.remove(__dirname + '/data/' + name, function(err) {
                if (err) {
                    return console.error(err)
                };
                console.log('DELETED FILE')
            });
            console.log('DELETED API: ' + name)
        }
    },
    store: function() {
        Fs.writeFile(__dirname + '/data/data.json', JSON.stringify(Storage.storage), 'utf8', function() {
            console.log('STORED TO DISK');
        });
    }
}
//LOAD STATUS FROM DISK
Fs.exists(__dirname + '/data', function(does) {
    if (!does) {
        Fs.mkdir(__dirname + '/data');
        initAndStore();
    }

    Fs.exists(__dirname + '/data/data.json', function(does) {
        if (does) {
            Fs.readFile(__dirname + '/data/data.json', 'utf8', function(err, data) {
                Storage.storage = JSON.parse(data);
                console.log('LOADED DATA.JSON');
            });
        } else {
            initAndStore();
        }
    });

    function initAndStore() {
        Storage.storage = {
            'api': {}
        };
        Storage.store();
        console.log('STORAGE FILE DATA.JSON CREATED')
    }
});

var server = Hapi.createServer('0.0.0.0', +process.env.PORT || 3000);

console.log('HELLOKAPI');

server.views({
    engines: {
        html: 'handlebars'
    },
    path: 'templates',
    layout: false
});

var controller = {};

controller.api = {};

controller.api.keyValue = {
    handler: function(req, reply) {
        var api = req.params.api,
            key = req.params.key,
            value = req.params.value;

        if (Storage.storage.api[api]) {

            console.log(api, '{ ' + key + ': \'' + value + '\' }');

            Fs.readFile(__dirname + '/data/' + api + '/' + api + '.json', 'utf8', function(err, data) {
                if (err) {
                    console.log('ERROR: ' + err);
                    return;
                }
                data = JSON.parse(data);
                var results = {
                    meta: {
                        name: api,
                        source: 'GSA.gov Generic API',
                        query: {},
                        'total-results': 0
                    },
                    results: [],
                }

                results.meta.query[key] = value;

                for (i = 0; i < data.csvRows.length; i++) {
                    if (data.csvRows[i][key] === value) {
                        results.results.push(data.csvRows[i]);
                        results.meta['total-results'] += 1;
                    }
                }
                reply(results);
            });
        } else {
            reply('<h1>GSA Generic API</h1><h2>API Not Found</h2>')
        }
    }
}

controller.api.values = {
    handler: function(req, reply) {
        var api = req.params.api,
            property = req.params.property,
            values = [];
        console.log(property)
        Fs.readFile(__dirname + '/data/' + api + '/' + api + '.json', 'utf8', function(err, data) {
            if (err) {
                console.log('Error: ' + err);
                return;
            }
            json = JSON.parse(data);
            json = json.csvRows
            for (i in json) {
                if (values.indexOf(json[i][property]) === -1) {
                    values.push(json[i][property])
                }
            }
            values = values.sort();

            if (req.query.callback) {
                reply(req.query.callback + '({"values":' + JSON.stringify(values) + '});')
            } else {
                reply(values)
            }

        });

    }
}
controller.api.queryString = {
    handler: function(req, reply) {

        var api = req.params.api,
            query = req.query,
            queryStart = 0,
            queryEnd = Infinity,
            jsonp,
            callback;

        if (Storage.storage.api[api]) {
            if (Object.size(query) === 0) {
                Fs.readFile(__dirname + '/data/' + api + '/' + api + '_table.html', 'utf8', function(err, table) {
                    reply('<link rel="stylesheet" type="text/css" href="//cdn.datatables.net/1.9.4/css/jquery.dataTables.css">' +
                        '<script type="text/javascript" language="javascript" src="//ajax.googleapis.com/ajax/libs/jquery/1.10.2/jquery.min.js"></script>' +
                        '<script type="text/javascript" language="javascript" src="//cdn.datatables.net/1.9.4/js/jquery.dataTables.js"></script>' +
                        '<script type="text/javascript">$(document).ready(function() {$("table").dataTable( {"sScrollY": "80%","bPaginate": false,"bScrollCollapse": true} );} );</script>' +
                        '<h1>GSA Generic API</h1><h2>' + Storage.storage.api[api].displayName + '</h2><ul><li><a href="./' + api + '/delete">Delete this API</a></li></ul><br>' + table);
                });


            } else {

                console.log(api, query);

                var count = 0;

                Fs.readFile(__dirname + '/data/' + api + '/' + api + '.json', 'utf8', function(err, data) {
                    if (err) {
                        console.log('Error: ' + err);
                        return;
                    }
                    data = JSON.parse(data);
                    var results = {
                        meta: {
                            name: api,
                            source: 'GSA.gov Generic API',
                            query: query,
                            'total-results': 0
                        },
                        results: [],
                    }
                    //START AND END POSITIONS
                    if (query.hasOwnProperty('start')) {
                        var start = parseFloat(query['start']);
                        queryStart = start - 1;
                        console.log('queryStart' + queryStart)
                        results.meta['start'] = start;
                        delete query['start'];
                    }
                    if (query.hasOwnProperty('end')) {
                        var end = parseFloat(query['end'])
                        queryEnd = end + 1;
                        console.log('queryEnd' + queryEnd)
                        results.meta['end'] = end;
                        delete query['end'];
                    }

                    if (query.callback) {
                        jsonp = true;
                        console.log('jsonp')
                        console.log(query.callback)
                        callback = query.callback;
                        delete query.callback;
                        delete query._;
                    }

                    //FIND IN ARRAY OF OBJECTS
                    Array.prototype.find = function(obj) {

                        for (var i = 0, len = this.length; i < len; i++) {
                            var ele = this[i],
                                match = true;

                            //SEE IF KEY CONTAINS WILDCARD
                            for (var x in obj) {
                                if (obj[x].toString().substr(obj[x].length - 1) === '*') {
                                    //WILDCARD AT BEGINNING AND END (CONTAINS)
                                    if (obj[x].toString().substr(0, 1) === '*') {
                                        //IF SO, REMOVE WILDCARDS
                                        var newKey = obj[x].replace(/\*/g, '');
                                        //BUILD REGEX
                                        var regex = new RegExp(newKey);
                                        //MATCH AGAINST REGEX
                                        if (ele[x].match(regex) < 1) {
                                            match = false;
                                            break;
                                        }
                                    }
                                    //WILDCARD AT END ONLY
                                    else {
                                        var newKey = obj[x].replace('*', '');
                                        var regex = new RegExp('^' + newKey);
                                        if (ele[x].match(regex) < 1) {
                                            match = false;
                                            break;
                                        }
                                    }
                                } else {
                                    if (ele[x] !== obj[x]) {
                                        match = false;
                                        break;
                                    }
                                }
                            }

                            if (match) {
                                count += 1;
                                if (count > queryStart && count < queryEnd) {
                                    results.results.push(data.csvRows[i]);
                                }
                                results.meta['total-results'] += 1;
                            }
                        }
                    };

                    data.csvRows.find(query);
                    if (jsonp) {
                        results = callback + '(' + JSON.stringify(results) + ');';
                    }
                    reply(results);
                });
            }
        } else {
            reply('<h1>GSA Generic API</h1><h2>API Not Found</h2>')
        }
    }
}

controller.api.baleted = {
    handler: function(req, reply) {
        var name = req.params.api;
        Storage.deleteAPI(name);
        reply('<h2>Deleting API: ' + name + '</h2><img src="http://archive.njosnavel.in/stimpy.gif" />' + metaRefresh(3, '/'));
    }
}

server.route({
    method: 'POST',
    path: '/upload',
    config: {
        payload: {
            output: 'stream',
            parse: true,
            maxBytes: 1048576 * 10,
        },
        handler: function(req, reply) {
            var displayName = req.payload.name;
            var name = displayName.toLowerCase().replace(/ /g, '-');

            if (Storage.storage.api[name]) {
                reply('An API with this name already exists.');
            } else {
                Fs.mkdir(__dirname + '/data/' + name)

                var csvFile = Fs.createWriteStream(__dirname + '/data/' + name + '/' + name + '.csv');

                req.payload.file /*.pipe(Zlib.createGunzip())*/ .pipe(csvFile);

                csvFile.on('finish', function() {
                    console.log('SAVED AS CSV');

                    var Converter = require("csvtojson").core.Converter;

                    var csvname = __dirname + '/data/' + name + '/' + name + '.csv';

                    var csvConverter = new Converter();
                    console.log('CONVERTING...');
                    csvConverter.from(csvname);

                    csvConverter.on("end_parsed", function(json) {
                        console.log('CONVERTED TO JSON');
                        var stringified = JSON.stringify(json);
                        Fs.writeFile(__dirname + '/data/' + name + '/' + name + '.json', stringified, function(err) {
                            if (err) {
                                console.log(err);
                            } else {
                                console.log('SAVED AS JSON');
                                var keys = Object.keys(json.csvRows[0]);

                                var table = '<table><thead>';

                                var keysLength = keys.length;

                                for (i = 0; i < keysLength; i++) {
                                    table += '<th>' + keys[i] + '</th>';
                                }

                                table += '</thead><tbody>'

                                for (i = 0; i < json.csvRows.length; i++) {
                                    table += '<tr>';
                                    for (j = 0; j < keysLength; j++) {
                                        if (json.csvRows[i][keys[j]] != 'undefined') {
                                            table += '<td>' + json.csvRows[i][keys[j]] + '</td>';
                                        }
                                    }
                                    table += '</tr>';
                                }

                                table += '</tbody></table>';


                                Fs.writeFile(__dirname + '/data/' + name + '/' + name + '_table' + '.html', table, function(err) {
                                    if (err) {
                                        console.log(err);
                                    } else {
                                        Storage.newAPI({
                                            name: name,
                                            displayName: displayName
                                        });
                                        reply('<h1>GSA Generic API</h1><p>Your new API Lives Here: <a href="/api/' + name + '">' + displayName + '</a>.</p><ul><li><a href="/add">Add Another API</a></li></ul');
                                    }
                                });
                            }
                        });
                    });
                });
            }
        }
    }
});



//DIRECT FROM FILESYSTEM (CSV)

server.route({
    method: 'GET',
    path: '/convert/{name}',
    config: {
        handler: function(req, reply) {
            var displayName = req.params.name;
            var name = displayName.toLowerCase().replace(/ /g, '-');

            var Converter = require("csvtojson").core.Converter;

            var csvname = __dirname + '/data/' + name + '/' + name + '.csv';

            var csvConverter = new Converter();
            console.log('CONVERTING...');
            csvConverter.from(csvname);

            csvConverter.on("end_parsed", function(json) {
                console.log('CONVERTED TO JSON');
                var stringified = JSON.stringify(json);
                Fs.writeFile(__dirname + '/data/' + name + '/' + name + '.json', stringified, function(err) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log('SAVED AS JSON');
                        var keys = Object.keys(json.csvRows[0]);

                        var table = '<table><thead>';

                        var keysLength = keys.length;

                        for (i = 0; i < keysLength; i++) {
                            table += '<th>' + keys[i] + '</th>';
                        }

                        table += '</thead><tbody>'

                        for (i = 0; i < json.csvRows.length; i++) {
                            table += '<tr>';
                            for (j = 0; j < keysLength; j++) {
                                if (json.csvRows[i][keys[j]] != 'undefined') {
                                    table += '<td>' + json.csvRows[i][keys[j]] + '</td>';
                                }
                            }
                            table += '</tr>';
                        }

                        table += '</tbody></table>';


                        Fs.writeFile(__dirname + '/data/' + name + '/' + name + '_table' + '.html', table, function(err) {
                            if (err) {
                                console.log(err);
                            } else {
                                Storage.newAPI({
                                    name: name,
                                    displayName: name
                                });
                                reply('<h1>GSA Generic API</h1><p>Your new API Lives Here: <a href="/api/' + name + '">' + name + '</a>.</p><ul><li><a href="/add">Add Another API</a></li></ul');
                            }
                        });
                    }
                });
            });


        }
    }
});
//DIRECT FROM JSON

server.route({
    method: 'GET',
    path: '/convert-json/{name}',
    config: {
        handler: function(req, reply) {
            var displayName = req.params.name;
            var name = displayName.toLowerCase().replace(/ /g, '-');

            Fs.readFile(__dirname+'/data/'+name+'/'+name+'.json', 'utf8', function(err, data) {
                if (err) {
                    console.log('ERROR: ' + err);
                    return;
                }
                var json = JSON.parse(data);
                console.log(json[0])
                var keys = Object.keys(json[0]);

                var table = '<table><thead>';

                var keysLength = keys.length;

                for (i = 0; i < keysLength; i++) {
                    table += '<th>' + keys[i] + '</th>';
                }

                table += '</thead><tbody>'

                for (i = 0; i < json.length; i++) {
                    table += '<tr>';
                    for (j = 0; j < keysLength; j++) {
                        if (json[i][keys[j]] != 'undefined') {
                            table += '<td>' + json[i][keys[j]] + '</td>';
                        }
                    }
                    table += '</tr>';
                }

                table += '</tbody></table>';


                Fs.writeFile(__dirname + '/data/' + name + '/' + name + '_table' + '.html', table, function(err) {
                    if (err) {
                        console.log(err);
                    } else {
                        Storage.newAPI({
                            name: name,
                            displayName: name
                        });
                        reply('<h1>GSA Generic API</h1><p>Your new API Lives Here: <a href="/api/' + name + '">' + name + '</a>.</p><ul><li><a href="/add">Add Another API</a></li></ul');
                    }
                });
            });
        }
    }
});

server.route({
    path: '/api/{api}/values/{property}',
    method: 'GET',
    config: controller.api.values
});

server.route({
    path: '/api/{api}/{key}/{value}',
    method: 'GET',
    config: controller.api.keyValue
});

server.route({
    path: '/api/{api}',
    method: 'GET',
    config: controller.api.queryString
});

server.route({
    path: '/api/{api}/delete',
    method: 'GET',
    config: controller.api.baleted
});

server.route({
    path: '/',
    method: 'GET',
    handler: function(req, reply) {
        var api = Storage.storage.api;
        if (api.length < 1) {
            reply('<h1>GSA Generic API</h1><h2>No APIs Available</h2>')
        } else {
            reply.view('api-index.html', {
                api: api
            });
        }
    }
});

server.route({
    method: 'GET',
    path: '/add',
    handler: function(req, reply) {
        reply('<h1>GSA Generic API</h1><h2>Add an API</h2>' +
            '<form action="/upload" method="post" enctype="multipart/form-data">' +
            '<label for="name">Name</label><input name="name" type="text"><br><br>' +
            '<label for="file">.CSV File:</label>' +
            '<input type="file" name="file" id="file"><br><br>' +
            '<input type="submit" name="submit" value="Submit">' +
            '</form>');
    }
});

server.start();

//ASSETS

Object.size = function(obj) {
    var size = 0,
        key;
    for (key in obj) {
        if (obj.hasOwnProperty(key)) size++;
    }
    return size;
};

function hasValue(obj, key, value) {
    return obj.hasOwnProperty(key) && obj[key] === value;
}

function metaRefresh(delay, path) {
    return '<META http-equiv="refresh" content="' + delay + ';URL=' + path + '">';
}