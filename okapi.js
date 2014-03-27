var Hapi = require('hapi');
var Handlebars = require('handlebars');
var Fs = require('fs-extra');


var Storage = {
    newAPI: function(obj) {
        console.log(Storage.storage, obj, Storage.storage.api)
        Storage.storage.api[obj.name] = obj;
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
                console.log('STORAGE.STORAGE POPULATED FROM DATA.JSON');
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

console.log('hellokapi');

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
                        totalResults: 0
                    },
                    results: [],
                }

                results.meta.query[key] = value;

                for (i = 0; i < data.csvRows.length; i++) {
                    if (data.csvRows[i][key] === value) {
                        results.results.push(data.csvRows[i]);
                        results.meta.totalResults += 1;
                    }
                }
                reply(results);
            });
        } else {
            reply('<h1>GSA Generic API</h1><h2>API Not Found</h2>')
        }
    }
}

controller.api.queryString = {
    handler: function(req, reply) {

        var api = req.params.api,
            query = req.query;

        if (Storage.storage.api[api]) {
            if (Object.size(query) === 0) {
                reply('<h1>GSA Generic API</h1><h2>' + Storage.storage.api[api].displayName + '</h2><ul><li><a href="./' + api + '/delete">Delete this API</a></li></ul>');
            } else {

                console.log(api, query);

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
                            totalResults: 0
                        },
                        results: [],
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
                                results.results.push(data.csvRows[i]);
                                results.meta.totalResults += 1;
                            }
                        }
                    };

                    data.csvRows.find(query);

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
        reply('Deleted API: ' + name + metaRefresh(3, '/'));
    }
}

server.route({
    method: 'POST',
    path: '/upload',
    config: {
        payload: {
            output: 'stream',
            parse: true
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
                        json = JSON.stringify(json);
                        Fs.writeFile(__dirname + '/data/' + name + '/' + name + '.json', json, function(err) {
                            if (err) {
                                console.log(err);
                            } else {
                                console.log('SAVED AS JSON');
                                Storage.newAPI({
                                    name: name,
                                    displayName: displayName
                                });
                                reply('<h1>GSA Generic API</h1><p>Your new API Lives Here: <a href="/api/' + name + '">' + displayName + '</a>.</p><ul><li><a href="/add">Add Another .CSV</a></li></ul');
                            }
                        });
                    });
                });
            }
        }
    }
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
        reply('<h1>GSA GENERIC API</h1><h2>Add a .CSV</h2>' +
            '<form action="/upload" method="post" enctype="multipart/form-data">' +
            '<label for="name">Name</label><input name="name" type="text">' +
            '<label for="file">File:</label>' +
            '<input type="file" name="file" id="file"><br>' +
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