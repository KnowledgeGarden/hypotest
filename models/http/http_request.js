var request = require('request');
var options;

/**
 * HttpClient created by wenzowski on 3/8/2016 based on code by park.
 * @see https://github.com/request/request
 * modified 20190416 by park
 */
module.exports = HttpClient;

/**
 * 
 * @param token
 *
 */
function HttpClient(token) {
  //console.info('HTTP', token);
  if (!token) throw 'token is required';
  //@see https://www.npmjs.com/package/request
  options = {};
  var header = {};
  header.Accept = "application/json";
  header.Authorization = "Bearer "+token;
  header['User-Agent'] = 'request';
  options.headers = header;
};

/**
 * Used to fetch Hypothes.is annotations
 * @param url
 * @callback (err, response)
 */
HttpClient.prototype.fetch = function(url, callback) {
  console.info('FETCH', url);
  options.url = url;
  request.get(options, function(err, response, body) {
    return callback(err, body);
  });
}

function encodeJSON(query) {
  return encodeURIComponent(JSON.stringify(query));
}

function prettyPrint(json) {
  return JSON.stringify(json, null, 2);
}
