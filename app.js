var express = require('express');
var app = express();
app.set("view engine", "ejs");
var fs = require('fs');

var bodyParser = require('body-parser');
var multer = require('multer');
var path = require('path');
var request = require('request');
var url = require('url');
// var reqress = require('reqress-stream');

var json_path = 'docs/data.json';
var json = readJson(json_path);
var img_path = 'docs/images/';
var sharp = require('sharp');

app.use(express.static('.'));
app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());

app.listen(5000, function () {
    console.log('listening on port 5000');
});

app.get('/', function (req, res) {
    res.render("index");
});

app.get('/docs/', function (req, res) {
    res.sendFile(__dirname + "/" + "docs/index.html");
});


////////////////
//// UPLOAD ////
////////////////

// storage used with Multer library to define where to save files on server, and how to save filename
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, img_path)
    },
    filename: function (req, file, cb) {
        var id = json.count;
        if (json.freeIds.length > 0) {
            id = json.freeIds.shift();
        }
        json.count++;
        cb(null, id + getExtension(file));
    }
});

function getExtension(file) {
    // this function gets the filename extension by determining mimetype. To be exanded to support others, for example .jpeg or .tiff
    var res = '';
    if (file.mimetype === 'image/jpeg') res = '.jpg';
    if (file.mimetype === 'image/png') res = '.png';
    if (file.mimetype === 'image/gif') res = '.gif';
    return res;
}

function getUploadedFiles() {
    var filenames = [];
    for (id in json.images) {
        filenames.push(json.images[id].originalname);
    }
    return filenames;
}

var upload = multer({
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (getUploadedFiles().indexOf(file.originalname) > -1) {
            cb(null, false);
        }
        cb(null, true)
    }
}).fields([ // fields to accept multiple types of uploads
    {name: "fileName"} // in <input name='fileName' />
]);

app.get('/upload', function (req, res) {
    res.render("upload");
});

app.post('/upload', function (req, res, next) {
    upload(req, res, function (err) { // changed req to req in order to track % upload reqress
        if (err) {
            res.status(err.status || 500).json({"error": {"status_code": err.status || 500, "message": err.code}});
            return;
        } else {

            // NOTE on what you can expect here
            // console.log(req.file); // if using upload.single('yourInputName')
            // console.log(req.files); // if using upload.fields([]); // array of input field names
            // console.log(req.body); // if using a text field instead of file input, ex. to grab url from another site by path name

            if (req.files.fileName) { // fileName comes from input element:   <input type="file" name="fileName">
                var ids = [];
                req.files.fileName.forEach(function (item) {
                    console.log(item);
                    var originalname = item.originalname;
                    var filename = item.filename.split(".");
                    var id = filename[0];
                    var extension = filename[1];
                    ids.push(id);
                    var newVal = {
                        "extension": "." + extension,
                        "originalname": originalname,
                        "tags": req.body.tags.split(",")
                    };
                    if (extension === "gif") {
                        newVal.tags.push("gif");
                    } else {
                        sharp(item.path).resize(300,300).max().toFile(img_path + "resized/" + filename, function (err) {
                            console.log(err);
                        });
                    }
                    json.images[id] = newVal;
                });
                updateJson(json, json_path);
                res.redirect(url.format({
                    pathname: "/edit",
                    query: {
                        "images": ids.toString()
                    }
                }));
                res.end();
            }
            else if (req.body.imageUrl) {

                // the text field was used, so process the input type=text with regular node/express
                var download = function (uri, filename, callback) {
                    request.head(uri, function (err, res, body) {
                        console.log('content-type:', res.headers['content-type']);
                        console.log('content-length:', res.headers['content-length']);
                        request(uri).pipe(fs.createWriteStream('./uploads/' + filename)).on('close', callback);
                    });
                };

                // this is only available when submitting a text url, not by choosing file to upload
                var urlParsed = url.parse(req.body.imageUrl);
                if (urlParsed.pathname) {
                    var onlyTheFilename = urlParsed.pathname ? urlParsed.pathname
                        .substring(urlParsed.pathname.lastIndexOf('/') + 1).replace(/((\?|#).*)?$/, '') : '';
                    //console.log(urlParsed)
                    var newFilename = onlyTheFilename + '-' + Date.now() + '-' + onlyTheFilename
                    var wholePath = 'uploads/' + newFilename;
                    download(urlParsed.href, newFilename, function () {
                        var reqJSON = JSON.stringify(wholePath, null, 2); // pretty print
                        res.end("<h1>Uploaded from URL</h2><img style='max-width:50%' src='" + wholePath + "'/><pre>" +
                            reqJSON + "</pre><a href='/'>Go back</a>");
                        console.log("wholePath");
                        console.log(wholePath)
                    });
                }
            }
        }
    });
});


//////////////
//// EDIT ////
//////////////

app.get('/edit', function (req, res) {
    var images = {};
    if (req.query.images) {
        var ids = req.query.images.split(",");
        ids.forEach(function (id) {
            if (json.images[id]) images[id] = json.images[id];
        })
    } else {
        images = json.images;
    }

    res.render("edit", {images: images});
});

app.post('/edit', function (req, res) {
    var updated = req.body;
    var images = json.images;
    for (img in updated) {
        var id = parseInt(img);
        var tags = updated[img].split(",");
        images[id].tags = tags;
    }
    json.images = images;
    updateJson(json, json_path);
    res.redirect('back');
});


////////////////
//// REMOVE ////
////////////////

app.post('/remove', function (req, res) {
    var ids = req.body["ids[]"];
    json.freeIds = json.freeIds.concat(ids);
    json.freeIds.sort();
    json.count = json.count - ids.length;
    for (i in ids) {
        var id = ids[i];
        var filename = id + json.images[id].extension;
        fs.unlinkSync(img_path + filename);
        delete json.images[id];
    }
    updateJson(json, json_path);
    res.redirect('back');
});

function readJson(path) {
    var rawdata = fs.readFileSync(path);
    return JSON.parse(rawdata);
};

function updateJson(json, path) {
    var data = JSON.stringify(json, null, 2);
    fs.writeFileSync(path, data);
};

