var express = require('express');
var app = express();
var fs = require('fs');

var bodyParser = require('body-parser');
var multer = require('multer');
var path = require('path');
var request = require('request');
var url = require('url');
var progress = require('progress-stream');

var json_path = 'docs/data.json';
var json = readJson(json_path);

app.use(express.static('.'));
app.use(bodyParser.urlencoded({extended: false}));

app.listen(5000, function () {
    console.log('listening on port 5000');
});

app.get('/docs/', function (req, res) {
    res.sendFile(__dirname + "/" + "docs/index.html");
});

app.get('/process_get', function (req, res) {
    // Prepare output in JSON format
    response = {
        tags: req.query.tags.split(",")
    };
    res.end(JSON.stringify(response));
});


// storage used with Multer library to define where to save files on server, and how to save filename
var storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './uploads')
    },
    filename: function (req, file, cb) {
        cb(null, json.count + getExtension(file));
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

var upload = multer({
    storage: storage,
    // limits: { fileSize: 1048576, files: 1 } // limit file size to 1048576 bytes or 1 MB
    //,fileFilter: // TODO limit types of files. currently can upload a .txt or any kind of file into uploads folder
}).fields([ // fields to accept multiple types of uploads
    {name: "fileName", maxCount: 1} // in <input name='fileName' />
]);

app.post('/uploads', function (req, res, next) {

    var prog = progress({time: 100}, function (progress) { // time:100 means will check progress every 100 ms, say to update progress bar
        // NOTE may need to increase accepted file size to see any kind of progress, might be too fast
        var len = this.headers['content-length'];
        var transf = progress.transferred;
        var result = Math.round(transf / len * 100) + '%';
        console.log(result); // writes progress to console. does not work with images from internet, only file uploads
        //if (result != '100%') res.send(result)
    });

    req.pipe(prog);
    prog.headers = req.headers;

    upload(prog, res, function (err) { // changed req to prog in order to track % upload progress
        if (err) {
            res.status(err.status || 500).json({"error": {"status_code": err.status || 500, "message": err.code}});
            return;
        } else {

            // NOTE on what you can expect here
            // console.log(req.file); // if using upload.single('yourInputName')
            // console.log(req.files); // if using upload.fields([]); // array of input field names
            // console.log(req.body); // if using a text field instead of file input, ex. to grab url from another site by path name

            if (prog.files.fileName) { // fileName comes from input element:   <input type="file" name="fileName">
                res.writeHead(200, {'Content-Type': 'text/html'});
                var reqJSON = JSON.stringify(prog.files.fileName, null, 2); // pretty print the JSON for <pre> tag

                res.write("<h1>Uploaded from file</h2><img style='max-width:20%' src='" + prog.files.fileName[0].path + "'/><pre>" + reqJSON + "</pre><a href='/'>Go back</a>");
                res.end();
                json.count++;
                updateJson(json, json_path);
            }
            else if (prog.body.imageUrl) {

                // the text field was used, so process the input type=text with regular node/express
                var download = function (uri, filename, callback) {
                    request.head(uri, function (err, res, body) {
                        console.log('content-type:', res.headers['content-type']);
                        console.log('content-length:', res.headers['content-length']);
                        request(uri).pipe(fs.createWriteStream('./uploads/' + filename)).on('close', callback);
                    });
                };

                // this is only available when submitting a text url, not by choosing file to upload
                var urlParsed = url.parse(prog.body.imageUrl);
                if (urlParsed.pathname) {
                    var onlyTheFilename = urlParsed.pathname ? urlParsed.pathname.substring(urlParsed.pathname.lastIndexOf('/') + 1).replace(/((\?|#).*)?$/, '') : '';
                    //console.log(urlParsed)
                    var newFilename = onlyTheFilename + '-' + Date.now() + '-' + onlyTheFilename
                    var wholePath = 'uploads/' + newFilename;
                    download(urlParsed.href, newFilename, function () {
                        var reqJSON = JSON.stringify(wholePath, null, 2); // pretty print
                        res.end("<h1>Uploaded from URL</h2><img style='max-width:50%' src='" + wholePath + "'/><pre>" + reqJSON + "</pre><a href='/'>Go back</a>")
                        console.log("wholePath")
                        console.log(wholePath)
                    });
                }
            }
        }
    });
});


function readJson(path) {
    var rawdata = fs.readFileSync(path);
    return JSON.parse(rawdata);
};

function updateJson(json, path) {
    var data = JSON.stringify(json, null, 2);
    fs.writeFileSync(path, data);
};

