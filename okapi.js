var Hapi = require('hapi');
var Handlebars = require('handlebars');
var Fs = require('fs');

console.log('hellokapi');

var server = Hapi.createServer('0.0.0.0', +process.env.PORT || 3000);

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

        console.log(api, '{ ' + key + ': \'' + value + '\' }');

        Fs.readFile('./data/' + api + '/' + api + '.json', 'utf8', function(err, data) {
            if (err) {
                console.log('Error: ' + err);
                return;
            }
            data = JSON.parse(data);
            var results = {
                meta: {
                    name: api,
                    source: 'OKAPI',
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
    }
}

controller.api.queryString = {
    handler: function(req, reply) {

        var api = req.params.api,
            query = req.query;

        if (Object.size(query) === 0) {
            reply('<h1>OKAPI</h1><h2>' + api + '</h2>');
        } else {

            console.log(api, query);

            Fs.readFile('./data/' + api + '/' + api + '.json', 'utf8', function(err, data) {
                if (err) {
                    console.log('Error: ' + err);
                    return;
                }
                data = JSON.parse(data);
                var results = {
                    meta: {
                        name: api,
                        source: 'OKAPI',
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
    }
}

server.route({
    method: 'GET',
    path: '/',
    handler: function(req, reply) {
        reply('<h1>OKAPI</h1><ul><li><a href="/api">See Available APIs</a></li><li><a href="/upload">Upload a .CSV</a></li>');
    }
});

server.route({
    method: 'POST',
    path: '/uploader',
    config: {
        payload: {
            output: 'stream',
            parse: true
        },
        handler: function(req, reply) {
            var fileName = req.payload.name.toLowerCase().replace(/ /g, '-');
            Fs.mkdir('./data/' + fileName)
            req.payload.file /*.pipe(Zlib.createGunzip())*/ .pipe(Fs.createWriteStream('./data/' + fileName + '/' + fileName + '.csv'));
            console.log(fileName);

            reply('<h1>OKAPI</h1><p>Your new API Lives <a href="/api/' + fileName + '">Here</a>.</p>');

            var Converter = require("csvtojson").core.Converter;

            var csvFileName = './data/' + fileName + '/' + fileName + '.csv';

            var csvConverter = new Converter();

            csvConverter.on("end_parsed", function(jsonObj) {
                console.log('CONVERTED TO JSON')
                jsonObj = JSON.stringify(jsonObj);
                Fs.writeFile('./data/' + fileName + '/' + fileName + '.json', jsonObj, function(err) {
                    if (err) {
                        console.log(err);
                    } else {
                        console.log('SAVED AS JSON');
                    }
                });
            });

            csvConverter.from(csvFileName);
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
    path: '/api',
    method: 'GET',
    handler: function(req, reply) {
        var apiName = [];
        Fs.readdir('./data', function(err, files) {
            if (err) throw err;
            files.forEach(function(file) {
                if (file.indexOf('.') === -1) {
                    apiName.push({
                        name: file
                    });
                }
            });
        });

        if (apiName.length === -1) {
            reply('<h1>OKAPI</h1><h2>No APIs Available</h2>')
        } else {
            reply.view('api-index.html', {
                api: apiName
            });
        }
    }
});

server.route({
    method: 'GET',
    path: '/upload',
    handler: function(req, reply) {
        reply('<h1>OKAPI</h1><p>Upload a .CSV</p>' +

            '<form action="/uploader" method="post" enctype="multipart/form-data">' +
            '<label for="name">Name</label><input name="name" type="text">' +
            '<label for="file">Filename:</label>' +
            '<input type="file" name="file" id="file"><br>' +
            '<input type="submit" name="submit" value="Submit">' +
            '</form>');
    }
})

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