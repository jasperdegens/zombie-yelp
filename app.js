var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var config = require('./config');
var routes = require('./routes/index');
var users = require('./routes/users');

var app = express();


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
app.use('/users', users);

// promise chain
app.get('/api/location/:loc', function(req, res){
    var loc = req.params.loc;
    geocodeLocation(loc)
    .then(yelpSearch)
    .then(function(worst){
        console.log('total num found restaurants = ' + worst.length);
        res.send(processYelpStats(worst));
    });
});

var Q = require('q');


var geocoderProvider = 'google';
var httpAdapter = 'https';
// optionnal 
var extra = {
    apiKey: config.geoCoder.key, // for Mapquest, OpenCage, Google Premier 
    formatter: null         // 'gpx', 'string', ... 
};
 
var geocoder = require('node-geocoder').getGeocoder(geocoderProvider, httpAdapter, extra);


var yelp = require("yelp").createClient(config.yelp);



// geocode location promise
function geocodeLocation(loc){
    var deferred = Q.defer();
    geocoder.geocode(loc, function(err, res){
        if (!err && res[0]){
            console.log('got location');
            deferred.resolve({latitude : res[0].latitude, longitude : res[0].longitude});
        }else{
            deferred.reject('Could not find location!');
        }
    });
    return deferred.promise;
}


// keep track of recursive calls
var reqCount = 0;

// define offset 
var latLonOffset = 0.06;

// NOTE: add functionality for south america and east of london
// but for now just subtract lat and long
function yelpSearch(loc){
    var deferred = Q.defer();
    var lat = loc.latitude;
    var lon = loc.longitude;
    var neLat = Math.round((lat + latLonOffset)*100000)/100000;
    var swLat = Math.round((lat - latLonOffset)*100000)/100000;
    var neLon = Math.round((lon + latLonOffset)*100000)/100000;
    var swLon = Math.round((lon - latLonOffset)*100000)/100000;
    var lowestRated = [];

    console.log('starting yelp search');
    // have resolve passed as callback -- let's see what happens
    findWorst(neLat, neLon, swLat, swLon, lowestRated, deferred.resolve);
    return deferred.promise;
}


function findWorst(neLat, neLon, swLat, swLon, lowestRated, callback){
    reqCount++;
    var bounds = swLat + ',' + swLon + '|' + neLat + ',' + neLon;
    console.log('bounds = ' + bounds);
    yelp.search({term: 'restaurants', bounds: bounds}, function(err, data){
        reqCount--;
        if(err || !data.businesses){
            console.log(data);
        }else{
            if (reqCount === 1){
                console.log('Total restaurants = ' + data.total);
            }
            var numResults = parseInt(data.total, 10);
            console.log('Restaurants in this query: ' + numResults);
            if (numResults < 1000){
                // trigger final query
                finalQuery(neLat, neLon, swLat, swLon, Math.max((numResults - 20), 0), lowestRated)
                .then(function(finishedSearching){
                    if (finishedSearching) {
                        callback(lowestRated);
                    }
                });
            } else {
                // recurse into 4 smaller squares
                // NOTE: add functionality for south america and east of london
                // but for now just subtract lat and long
                var latMid = Math.round((neLat - ((neLat - swLat)/2))*100000)/100000;
                var lonMid = Math.round((neLon - ((neLon - swLon)/2))*100000)/100000;
                findWorst(neLat, neLon, latMid, lonMid, lowestRated, callback);
                findWorst(neLat, lonMid, latMid, swLon, lowestRated, callback);
                findWorst(latMid, neLon, swLat, lonMid, lowestRated, callback);
                findWorst(latMid, lonMid, swLat, swLon, lowestRated, callback);

            }
        }
        // thie req fulfilled
    });
}

function finalQuery(neLat, neLon, swLat, swLon, offset, lowestRated){
    var deferred = Q.defer();
    reqCount++;
    var bounds = swLat + ',' + swLon + '|' + neLat + ',' + neLon;
    yelp.search({term: 'restaurants', bounds: bounds, offset: offset}, function(err, data){
        reqCount--;
        // console.log('final query::::');
        // console.log('offest = ' + offset);
        // console.log('bounds = ' + bounds);
        console.log(data.businesses);
        for (var i = 0; i < data.businesses.length; i++){
            lowestRated.push(data.businesses[i]);
        }
        if (reqCount === 0) {
            deferred.resolve(true);
        }
        deferred.resolve(false);
    });
    return deferred.promise;
}


// process worst reataurants -- stored in global worst array
// sort by rating + review count
// for now set threshold form num reviews at 15
function processYelpStats(arr){
    var reviewCountThreshold = 10;
    arr.sort(function(a, b){
        if (parseInt(a.review_count, 10) < reviewCountThreshold) {
            return 1;
        }
        if (parseInt(b.review_count, 10) < reviewCountThreshold) {
            return -1;
        }
        var rateComp = parseFloat(a.rating) - parseFloat(b.rating);
        if(rateComp === 0){
            return b.review_count - a.review_count;
        }else{
            return rateComp;
        }
    });
    return arr.slice(0, Math.min(20, arr.length));
}


// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});


// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;

app.listen(3000);
